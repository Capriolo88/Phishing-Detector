const {Cu} = require("chrome");
Cu.import("resource://gre/modules/Promise.jsm");
const IO = require("./IO"),
    random = require("./Random").randomNumber;
var async = require('./async');
//var _ = require('./underscore');
//_.str = require('./underscore.string');
//_.mixin(_.str.exports());
//_.str.include('Underscore.string', 'string');

function ArffData(from, datas) {
    if (from instanceof ArffData) {
        this.name = from.name;
        this.attributes = from.attributes;
        this.types = from.types;
        this.class_name = from.class_name;
    } else {
        this.name = '';
        this.attributes = [];
        this.types = {};
        this.class_name = null;
    }
    this.data = [];
    if (datas)
        this.data = this.data.concat(datas instanceof ArffInstance ? datas.getData() : datas);
}

ArffData.COSTANTS = {RELATION: 'name', ATTRIBUTE: 'attribute', DATA: 'data', TYPES: 'type', CLASS_NAME: 'class_name'};

ArffData.prototype = {
    set: function (what, value1, value2) {
        switch (what) {
            case ArffData.COSTANTS.RELATION:
                this.name = value1;
                break;
            case ArffData.COSTANTS.ATTRIBUTE:
                this.attributes.push(value1);
                this.types[value1] = value2;
                break;
            case ArffData.COSTANTS.DATA:
                this.data.push(value1);
                break;
            case ArffData.COSTANTS.CLASS_NAME:
                this.class_name = value1;
                break;
        }
    },

    get: function (what) {
        switch (what) {
            case ArffData.COSTANTS.RELATION:
                return this.name;
            case ArffData.COSTANTS.ATTRIBUTE:
                return this.attributes;
            case ArffData.COSTANTS.TYPES:
                return this.types;
            case ArffData.COSTANTS.DATA:
                return this.data;
            case ArffData.COSTANTS.CLASS_NAME:
                return this.class_name;
        }
    },

    addInstance: function (data) {
        this.set(ArffData.COSTANTS.DATA, data.getData());
    },

    /**
     * Parse the weka dataset from text
     * @param text
     * @returns {ArffData}
     */
    parse: function (text) {
        var section, lines = text.split(/\n/), line;

        for (let i = 0; i < lines.length; i++) {
            line = lines[i];
            if (!section) section = 'header';
            var chunks = line.trim().split(/[\s]+/);

            if ((chunks.length === 1 && chunks[0] === '') || /^%/.test(chunks[0]))
                continue;
            if (/^@RELATION/i.test(chunks[0])) {
                if (section !== 'header') {
                    throw new Error('@RELATION found outside of header');
                }
                this.set(ArffData.COSTANTS.RELATION, chunks[1]);
            }
            // attribute spec
            else if (/^@ATTRIBUTE/i.test(chunks[0])) {
                if (section != 'header') {
                    throw new Error('@ATTRIBUTE found outside of header section');
                }
                var name = chunks[1].replace(/['"]|:$/g, '');
                var type = parseAttributeType(chunks.slice(2).join(' '));
                this.set(ArffData.COSTANTS.ATTRIBUTE, name, type);
                // class is the last attribute to default
                this.class_name = name;
            } else if (/^@DATA/i.test(chunks[0])) {
                if (section == 'data') {
                    throw new Error('@DATA found after DATA');
                }
                section = 'data';
            } else {
                if (section == 'data') {
                    var datas = line.replace(/['"]/g, '').split(','), instance = new ArffInstance();
                    var _this = this;
                    datas.forEach(function (datum, i) {
                        var field = _this.attributes[i];
                        var type = _this.types[field];
                        if (type.type == 'numeric') {
                            if (datum.indexOf('.') >= 0) {
                                datum = parseFloat(datum);
                            } else {
                                datum = parseInt(datum);
                            }
                        } else if (type.type == 'nominal') {
                            datum = type.oneof.indexOf(datum);
                        }
                        try {
                            instance.setAttribute(field, datum);
                        } catch (e) {
                            console.log(e);
                        }
                    });
                    this.set(ArffData.COSTANTS.DATA, instance.getData());
                }
            }
        }
        return this;
    },

    shuffle: function () {
        for (var j, x, i = this.data.length; i; j = Math.floor(Math.random() * i), x = this.data[--i], this.data[i] = this.data[j], this.data[j] = x);
        return this;
    },

    merge: function (arffdata) {
        if (arffdata instanceof  ArffData && arffdata.name === this.name)
            this.data = this.data.concat(arffdata.data);
        this.shuffle();
    },

    resetData: function () {
        this.data = [];
    },

    appendToArffFile: function (name, cb) {
        var arffFile = '';
        var _this = this;
        async.waterfall([function (callback) {
            async.eachSeries(_this.data, function (obj, dataCb) {
                let _class = obj[_this.class_name];
                delete obj[_this.class_name];
                let keys = Object.keys(obj).sort();

                for (let i = 0; i < keys.length; i++)
                    arffFile = arffFile + obj[keys[i]] + ',';
                arffFile += _class;
                arffFile += '\n';

                dataCb();

            }, function (err) {
                callback(err);
            });
        }, function (err, result) {
            var pathDir = IO.path(null, 'weka');
            var pathFile = IO.path(pathDir, name);

            IO.makeDir(pathDir).then((res)=> {
                IO.write(pathFile, arffFile, function (exist) {
                    return exist ? {write: true} : null;
                }, cb);
            }, (error)=> {
                console.log(error);
            });
        }]);
    },

    /**
     * Parse to string a write on file the dataset object
     * @param name name of the file
     * @param cb callback function
     */
    toNewArffFile: function (name, cb) {

        if (typeof name === 'function')
            cb = name, name = null;

        var arffFile = '';
        arffFile += '@relation ';
        arffFile += this.name;
        arffFile += '\n\n';

        var _this = this;

        async.waterfall([
            function (callback) {
                var i = 0;
                async.eachSeries(_this.data, function (obj, dataCb) {

                    async.eachSeries(Object.keys(obj), function (key, mapCb) {
                        //                                                   !_.isString(_this.data[i][key])
                        if (_this.types[key].type.indexOf('nominal') > -1 && typeof _this.data[i][key] !== 'string') {
                            _this.data[i][key] = _this.types[key].oneof[_this.data[i][key]];
                        }

                        mapCb();

                    }, function (err) {
                        i++;
                        dataCb(err);
                    });

                }, function (err) {
                    callback(err);
                });
            },
            function (callback) {
                async.eachSeries(_this.attributes, function (obj, attrCb) {

                    arffFile += '@attribute ';
                    arffFile += obj;
                    arffFile += ' ';

                    if (_this.types[obj].type.indexOf('nominal') > -1) {
                        arffFile += '{' + _this.types[obj].oneof + '}';
                    } else {
                        arffFile += _this.types[obj].type;
                    }

                    arffFile += '\n';

                    attrCb();

                }, function (err) {
                    callback(err);
                });
            },
            function (callback) {

                arffFile += '\n';
                arffFile += '@data';
                arffFile += '\n';

                async.eachSeries(_this.data, function (obj, dataCb) {
                    let _class = obj[_this.class_name];
                    delete obj[_this.class_name];
                    let keys = Object.keys(obj).sort();

                    for (let i = 0; i < keys.length; i++)
                        arffFile = arffFile + obj[keys[i]] + ',';
                    arffFile += _class;
                    arffFile += '\n';

                    dataCb();

                }, function (err) {
                    callback(err);
                });
            }
        ], function (err, result) {
            var pathDir = IO.path(null, 'weka');
            var fileName = !name ? 'weka-' + random(0, 10000000) + '.arff' : name;
            if (!name)
                pathDir = IO.path(pathDir, '.tmp');             // .tmp cartella nascosta linux
            var pathFile = IO.path(pathDir, fileName);

            IO.makeDir(pathDir).then((res)=> {
                IO.write(pathFile, arffFile, function (exist) {
                    return exist ? null : {create: true};
                }, cb);
            }, (error)=> {
                console.log(error);
            });
        });
    }
};

/**
 * Parse a file .arff to an ArffData Object
 * @param {string} path path of the .arff file
 * @returns {Promise} if callback is null or undefined return a promise
 * @param {function} callback function for the async call
 */
ArffData.fromArffFile = function (path, callback) {
    if (callback && typeof callback !== 'function')
        throw new Error('Callback is not a function');
    var promise;
    if (!callback)
        promise = Promise.defer();
    IO.read(path).then((text)=> {
        try {
            var arffData = (new ArffData()).parse(text);
            callback ? callback(arffData) : promise.resolve(arffData);
        } catch (err) {
            callback ? callback(err) : promise.reject(err);
        }
    }, (err)=> {
        callback ? callback(err) : promise.reject(err);
    });
    if (!callback)
        return promise.promise;
};

/*
 * Types can be any of:
 *  - numeric | integer | real | continuous
 *  - string
 *  - date [format]
 *  - nominal
 */
function parseAttributeType(type) {
    var finaltype = {type: type};
    var parts;

    if (/^date/i.test(type)) {
        parts = type.split(/[\s]+/);
        var format = "yyyy-MM-dd'T'HH:mm:ss";
        if (parts.length > 1) {
            format = parts[1];
        }
        finaltype = {
            type: 'date',
            format: format
        }
    }
    else if (parts = type.match(/^{([^}]*)}$/)) {
        finaltype.type = 'nominal';
        finaltype.oneof = parts[1].replace(/[\s'"]/g, '').split(/,/);
    }
    else if (/^numeric|^integer|^real|^continuous/i.test(type)) {
        finaltype.type = 'numeric';
    }
    else if (/string/i.test(type)) {
        finaltype.type = 'string';
    }
    return finaltype;
}

/**
 * Write a string in a file, if not exist create it
 * @param path path of the file
 * @param text
 * @param cb
 */
//function write(path, text, cb) {
//    OS.File.exists(path).then((exist)=> {
//        OS.File.open(path, exist ? {write: true} : {create: true}).then((file)=> {
//            file.write(encoder.encode(text)).then(()=> {
//                console.log('finito di scrivere');
//                file.close();
//                cb(null, path);
//            }, (error)=> {
//                console.log('errore in ' + (exist ? '' : 'prima ') + 'scrittura log: ' + error);
//                file.close();
//                cb(error, path);
//            });
//        }, (error)=> {
//            cb(error, path);
//            console.log(error);
//        });
//    });
//}

/**
 * ArffInstance class. A @data line
 * @constructor
 */
function ArffInstance() {
    this.data = {};
}

ArffInstance.prototype = {
    /**
     * Set the attribute of an instance
     * @param {string} attr name of the attribute
     * @param {boolean|number|null} val Value of attr, if boolean is corverted to 0|1, if null is undefined (?)
     * @returns {boolean}
     */
    setAttribute: function (attr, val) {
        if (typeof val === 'boolean') {
            val = val ? 1 : 0;
        } else if (val === null) {
            val = '?';
        } else if (typeof val !== 'number') {
            throw new Error("For attr:'" + attr + "', accept only boolean or numeric value");
        }
        this.data[attr] = val;
        return true;
    },
    /**
     * Set the attribute of an instance
     * @param {string} name name of the class
     * @param {boolean|number} val Value of class, if boolean is corverted to 0|1
     * @returns {boolean}
     */
    setClass: function (name, val) {
        if (typeof val === 'boolean')
            val = val ? 1 : 0;
        else if (typeof val !== 'number')
            throw new Error("For class:'" + name + "', accept only boolean or numeric value");
        this.data[name] = val;
        return true;
    },

    getData: function () {
        return this.data;
    }
};


module.exports.ArffData = ArffData;
module.exports.ArffInstance = ArffInstance;
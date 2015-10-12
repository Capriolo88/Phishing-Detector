const {URL} = require("sdk/url"),
    self = require("sdk/self"),
    {XMLHttpRequest} = require("sdk/net/xhr"),
    {Cu} = require("chrome"),
    weka = require("./weka"),
    {ArffData,ArffInstance} = require("./ArffData"),
    IO = require("./IO");

Cu.import("resource://gre/modules/Promise.jsm");

const REGEX_DOMAIN = /(http[s]?|ftp):\/\/(((\d{1,3}\.){3}(\d{1,3}))|((www\.)?(((\w|[-])+\.){2,})(\w|[-])+))/;
const REGEX_IP = /^(\d+|(\d{1,3}\.){3}\d{1,3})$/;

const URL_ATTRIBUTES_NAMES =
    ["encripted", "has-authority", "has-query", "host-digit-count", "host-hyphen-count", "host-ip-based", "host-length", "host-token-count", "host-underscore-count",
        "path-at-count", "path-colon-count", "path-digit-count", "path-equals-count", "path-hyphen-count", "path-length", "path-semicolon-count", "path-token-count", "path-underscore-count",
        "port", "ratio-consonant-url", "ratio-digit-host", "ratio-digit-url", "ratio-host-path-length", "ratio-host-url-length",
        "subhost-ip-based", "subhost-token-count", "unesc-ampersand-count", "url-length", "class"];

const RELATION = 'phishing';
// Default the last attribute in the file
const CLASS_NAME = 'class',
    CLASS_DEFAULT_VALUE = 0;

//var trainer_dataset = null;
const weka_path = IO.path(null, 'weka', 'weka.jar');
const trainer_path = IO.path(null, 'weka', 'trainer.arff');

var new_dataset = null;
var activated = false;

const WekaAnalyzer = {
    activate: activate,
    deactivate: deactivate,
    //mergeDataset: mergeDataset,
    classifyURL: classifyUrl,
    install: install,
    save: saveDataset
};

function activate(callback) {
    loadDataset(trainer_path, function (status) {
            if (status.status === 'ERR') {
                if (IO.errorType(status.mess) === IO.ERROR_TYPE.NO_EXIST)
                    install(function () {
                        activate(callback);
                    });
            } else {
                activated = true;
                if (callback)
                    callback();
            }
        }
    );
}

function deactivate(callback) {
    //trainer_dataset = null;
    new_dataset = null;
    activated = false;
}

function isActivated() {
    return activated;
}

function install(callback) {
    IO.makeDir(IO.path(null, 'weka')).then((res)=> {
        var xhr = new XMLHttpRequest();
        xhr.responseType = 'arraybuffer';
        xhr.open('GET', self.data.url("../bin/weka.jar"));
        xhr.onload = ()=> {
            if (xhr.status !== 200)
                return;
            IO.write(IO.path(null, 'weka', 'weka.jar'), new Uint8Array(xhr.response), function (exist) {
                return exist ? null : {create: true};
            }).then(()=> {
                IO.write(trainer_path, self.data.load("./trainer.arff"), function (exist) {
                    return exist ? null : {create: true};
                }).then(()=> {
                    if (callback)
                        callback();
                }, (err)=> {
                    if (callback)
                        callback(err);
                });
            }, (err)=> {
                if (err.exist)
                    IO.write(trainer_path, self.data.load("./trainer.arff"), function (exist) {
                        return exist ? null : {create: true};
                    }).then(()=> {
                        if (callback)
                            callback();
                    }, (err)=> {
                        if (callback)
                            callback(err);
                    });
                else if (callback)
                    callback(err);
            });
        };
        xhr.send(null);
    });
}

// is not an important function
//function mergeDataset() {
//    trainer_dataset.merge(new_dataset);
//    new_dataset.resetData();
//}

function saveDataset(callback) {
    IO.exist(IO.path(null, 'weka', 'new.arff'), (exist)=> {
        if (exist)
            new_dataset.appendToArffFile('new.arff', function (err, path) {
                if (!err) {
                    console.log('Writed file on location: ' + path);
                    new_dataset.resetData();
                }
                if (callback)
                    callback(err, path);
            });
        else
            new_dataset.toNewArffFile('new.arff', function (err, path) {
                if (!err) {
                    console.log('Writed file on location: ' + path);
                    new_dataset.resetData();
                }
                if (callback)
                    callback(err, path);
            });
    });
}

function loadDataset(path, callback) {
    ArffData.fromArffFile(path).then((data)=> {
        //trainer_dataset = data;
        new_dataset = new ArffData(data);
        if (typeof callback === 'function')
            callback({status: 'OK', mess: 'Loading complete!'});
    }, (e)=> {
        if (typeof callback === 'function')
            callback({status: 'ERR', mess: e});
    });
}

function classifyUrl(url, callback) {
    if (callback && typeof callback !== 'function')
        throw new Error('Callback is not a function');
    if (!isActivated())
        return null;
    var promise;
    if (!callback)
        promise = Promise.defer();
    var parsed_data = parseUrl(url);
    if (!parsed_data)
        return null;
    let options = {classifier: 'weka.classifiers.trees.J48', params: ''};
    weka.classify(weka_path, trainer_path, new ArffData(new_dataset, parsed_data), options, function (err, result) {
        if (result) {
            parsed_data.setClass(CLASS_NAME, parseInt(result.predicted));
            new_dataset.addInstance(parsed_data);
            saveDataset();
            callback ? callback(null, result) : promise.resolve(result);
        } else {
            callback ? callback(err, null) : promise.reject(err);
        }
    });
    if (!callback)
        return promise.promise;
}

/**
 * Parse an URL as an ArffInstance
 * @param {string} url
 * @returns {*}
 */
function parseUrl(url) {
    if (!url)
        return;
    url = url instanceof URL ? url : URL(url);
    var instance = new ArffInstance();

    var app = !url.port ? 80 : url.port;
    try {
        instance.setAttribute('port', app);
        instance.setAttribute('encripted', url.scheme === 'https');

        if ((app = REGEX_DOMAIN.exec(url.path)))
            app = URL(app).host;
        instance.setAttribute('subhost-token-count', app ? app.split('.').length : null);
        instance.setAttribute('subhost-ip-based', app ? REGEX_IP.test(app) : null);

        instance.setAttribute('has-authority', url.userPass !== null);
        instance.setAttribute('host-ip-based', REGEX_IP.test(url.host));
        instance.setAttribute('host-token-count', url.host.split('.').length);

        let url_length = url.href.length,
            host_length = url.host.length,
            path_length = url.path.length,
            digit_count = 0;

        instance.setAttribute('url-length', url_length);
        instance.setAttribute('host-length', host_length);
        instance.setAttribute('path-length', path_length);
        instance.setAttribute('ratio-host-path-length', host_length / path_length);
        instance.setAttribute('ratio-host-url-length', host_length / url_length);

        app = url.host.matchCount(/\d/g);
        digit_count += app;

        instance.setAttribute("host-digit-count", app);
        instance.setAttribute("ratio-digit-host", app / host_length);
        instance.setAttribute("host-hyphen-count", url.host.matchCount(/-/g));
        instance.setAttribute("host-underscore-count", url.host.matchCount(/_/g));

        app = url.path.matchCount(/\d/g);
        digit_count += app;

        instance.setAttribute("path-digit-count", app);
        instance.setAttribute("path-token-count", url.path.split('/').length);

        instance.setAttribute("path-hyphen-count", url.path.matchCount(/-/g));
        instance.setAttribute("path-equals-count", url.path.matchCount(/=/g));
        instance.setAttribute("path-colon-count", url.path.matchCount(/:/g));
        instance.setAttribute("path-semicolon-count", url.path.matchCount(/;/g));
        instance.setAttribute("path-at-count", url.path.matchCount(/@/g));
        instance.setAttribute("path-underscore-count", url.path.matchCount(/_/g));

        instance.setAttribute("ratio-digit-url", digit_count / url_length);

        let consonant_count = url.href.replace(/[aeiou0-9_]/gi, '').matchCount(/\w/g);

        instance.setAttribute("ratio-consonant-url", consonant_count / url_length);
        instance.setAttribute("has-query", (url.search != null && url.search != ''));
        instance.setAttribute("unesc-ampersand-count", url.path.matchCount(/&/g));

        instance.setClass(CLASS_NAME, CLASS_DEFAULT_VALUE);

        return instance;
    } catch (e) {
        console.log(e);
        return null;
    }
}

/**
 * @param {RegExp} regexp
 * @returns {*}
 */
String.prototype.matchCount = function (regexp) {
    var ret = this.match(regexp);
    return ret ? ret.length : 0;
};

module.exports = WekaAnalyzer;
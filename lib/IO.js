const {Cu} = require("chrome"),
    {TextEncoder, OS} = Cu.import("resource://gre/modules/osfile.jsm", {});
Cu.import("resource://gre/modules/Promise.jsm");

const encoder = new TextEncoder();

/**
 * Base directory for the addon files
 */
var BASE_DIR_PATH = OS.Path.join(OS.Constants.Path.profileDir, 'phishingdetect');

const ERROR_TYPE = {EXIST: 'exist', NO_EXIST: 'not exist', CLOSED: 'closed', OTHER: 'not file error'};

function changeBaseDirPath(base_dir) {
    BASE_DIR_PATH = base_dir;
}

/**
 * Variable parameters
 * @param base_dir
 * @returns {string} Return the path
 */
function path(base_dir) {
    var PATH = !base_dir ? BASE_DIR_PATH : base_dir;
    for (let i = 1; i < arguments.length; i++)
        PATH = OS.Path.join(PATH, arguments[i]);
    return PATH;
}

/**
 * Read a file from path
 * @param path
 * @param {function?} callback
 * @returns {Promise?}
 */
function read(path, callback) {
    if (callback && typeof callback !== 'function')
        throw new Error('Callback is not a function');
    var promise;
    if (!callback)
        promise = Promise.defer();
    OS.File.read(path, {encoding: "utf-8"}).then(
        (text)=> {
            callback ? callback(text) : promise.resolve(text);
        }, (error)=> {
            callback ? callback(error) : promise.reject(error);
        }
    );
    if (!callback)
        return promise.promise;
}

/**
 * Write a text to file, if exist append otherwhise create it
 * @param path
 * @param {string|ArrayBuffer}to_write
 * @param {function|object} control_options function with argument 'exist', must return an object option for write or null(to skip), or an object option for write
 * @param {function?} callback
 * @returns {Promise?}
 */
function write(path, to_write, control_options, callback) {
    if (callback && typeof callback !== 'function')
        throw new Error('Callback is not a function');
    var promise;
    if (!callback)
        promise = Promise.defer();
    OS.File.exists(path).then((exist)=> {
        var options;
        if (typeof control_options === 'function')
            options = control_options(exist);
        else if (Object.isObject(control_options))
            options = control_options;
        if (!options)
            callback ? callback({exist: exist}, path) : promise.reject({exist: exist});
        OS.File.open(path, options).then((file)=> {
            file.write(typeof to_write === 'string' ? encoder.encode(to_write) : to_write).then(()=> {
                file.close();
                callback ? callback(null, path) : promise.resolve(path);
            }, (error)=> {
                file.close();
                callback ? callback(error, path) : promise.reject(error);
            });
        }, (error)=> {
            callback ? callback(error, path) : promise.reject(error);
        });
    });
    if (!callback)
        return promise.promise;
}

/**
 * Make a dir at path
 * @param pathDir
 * @param {function?}callback
 * @returns {Promise?}
 */
function makeDir(pathDir, callback) {
    if (callback && typeof callback !== 'function')
        throw new Error('Callback is not a function');
    var promise;
    if (!callback)
        promise = Promise.defer();
    OS.File.makeDir(pathDir).then(()=> {
        callback ? callback({create: true, exist: false}) : promise.resolve({create: true, exist: false});
    }, (error)=> {
        if (error instanceof OS.File.Error && error.becauseExists)
            callback ? callback({create: false, exist: true}) : promise.resolve({create: false, exist: true});
        else
            callback ? callback({error: error}) : promise.reject({error: error});
    });
    if (!callback)
        return promise.promise;
}

/**
 *
 * @param path_file
 * {function?}callback
 * @returns {Promise?}
 */
function remove(path_file, callback) {
    if (callback && typeof callback !== 'function')
        throw new Error('Callback is not a function');
    var promise;
    if (!callback)
        promise = Promise.defer();
    OS.File.remove(path_file).then(()=> {
        callback ? callback(null, path_file) : promise.resolve(path_file);
    }, (e)=> {
        callback ? callback(e, path_file) : promise.reject(e);
    });
    if (!callback)
        return promise.promise;
}

function exist(path_file, callback) {
    if (callback && typeof callback !== 'function')
        throw new Error('Callback is not a function');
    var promise;
    if (!callback)
        promise = Promise.defer();
    OS.File.exists(path_file).then((exist)=> {
        callback ? callback(exist) : promise.resolve(exist);
    });
    if (!callback)
        return promise.promise;
}

function errorType(err) {
    if (err instanceof OS.File.Error)
        if (err.becauseExists)
            return 'exist';
        else if (err.becauseNoSuchFile)
            return 'not exist';
        else if (err.becauseClosed)
            return 'closed';
        else
            return 'not file error';
}

module.exports = {
    read: read,
    write: write,
    makeDir: makeDir,
    path: path,
    remove: remove,
    exist: exist,
    errorType: errorType,
    ERROR_TYPE: ERROR_TYPE
};
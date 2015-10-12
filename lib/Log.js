'use strict'

const IO = require("./IO"),
    pathDir = IO.path(),
    pathFile = IO.path(pathDir, 'log.txt');

/**
 * Print the string formatted with date in argument on a file
 */
function log() {
    var args = (arguments.length === 1 && Array.isArray(arguments[0])) ? arguments[0] : arguments;
    var str = format(false, args);
    IO.makeDir(pathDir).then(()=> {
        IO.write(pathFile, str, function (exist) {
            return exist ? {write: true} : {create: true};
        });
    }, (error)=> {
        console.log(error);
    });
}

function error() {
    var args = (arguments.length === 1 && Array.isArray(arguments[0])) ? arguments[0] : arguments;
    var str = format(true, args);
    IO.makeDir(pathDir).then(()=> {
        IO.write(pathFile, str, function (exist) {
            return exist ? {write: true} : {create: true};
        });
    }, (error)=> {
        console.log(error);
    });
}

/**
 * Format an array of object to write on file
 * @param error
 * @param args
 * @returns {string}
 */
function format(error, args) {
    var wrt = '[' + new Date().toLocaleString() + ']',
        len = wrt.length, space = '                         ';
    for (let i = 0; i < 25 - len; i++) {
        wrt += ' ';
    }
    let app;
    if (error) wrt += error ? 'ERROR\r\n' : '';
    for (let i = 0; i < args.length; i++) {
        app = args[i];
        wrt += !error && i == 0 ? '' : space;
        if (typeof app === 'object') {
            app = JSON.stringify(app);
            app = app.split('":').join('": ').split(',"').join(', "');
        }
        wrt += app + '\r\n';
    }
    wrt += space + '----------------------------------------------------------------------------------------------------\r\n';
    return wrt;
}

module.exports.log = log;
module.exports.error = error;
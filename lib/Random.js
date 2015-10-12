'use strict'

const NUMSET = '0123456789',
    CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    SPECIALSET = '.-_',
    MAILPROVIDERS = ['gmail.com', 'yahoo.it', 'hotmail.com', 'live.com', 'live.it', 'hotmail.it', 'tiscali.it', 'libero.it'];

/**
 * Return a random String of length [length] with characters from [set], or a random element from an array (in this case length must be set to 1)
 * @param {number} length The length of the random string
 * @param {string|array} set The set of characters or an array
 * @returns {string} Random string or random element from array
 */
function randomString(length, set) {
    var result = '';
    for (var i = 0; i < length; i++) result += set[Math.round(Math.random() * (set.length - 1))];
    return result;
}

/**
 * Return a random number between min and max if at least one is specified, 8 otherwise
 * @param {?number} min Default 6
 * @param {?number} max Default 12
 * @returns {number} A random number || 8
 */
function randomNumber(min, max) {
    var length;
    if (!min && !max)
        length = 8;
    else if (min === max || max < 7)
        length = max;
    else
        min = min || 6, length = min + Math.round(Math.random() * ((max || 12) - min - 1));
    return length;
}

module.exports.NUMSET = NUMSET;
module.exports.CHARSET = CHARSET;
module.exports.DIGIT = NUMSET + CHARSET;
module.exports.MAILPROVIDERS = MAILPROVIDERS;
module.exports.randomString = randomString;
module.exports.randomNumber = randomNumber;
'use strict'

function isPatternMatch(str, pattern) {
    return pattern instanceof RegExp ? pattern.test(str) : pattern === str;
}

function patternMatchIndexOf(str, pattern, start) {
    var offset = start;
    while (!isPatternMatch(str.charAt(offset), pattern) &&
    offset < str.length) {
        offset++;
    }
    return offset;
}

function StringCursor(str) {
    this._str = str;
    this._offset = 0;
}

StringCursor.prototype = {
    remaining: function () {
        return this._str.length - this._offset;
    },

    clear: function () {
        this._offset = 0;
    },

    peek: function (length) {
        return this._str.slice(this._offset, this._offset + length);
    },

    skip: function (length) {
        this._offset = Math.min(this._offset + length, this._str.length);
    },

    chomp: function (length) {
        var slice = this._str.slice(this._offset, this._offset + length);
        this._offset = Math.min(this._offset + length, this._str.length);
        return slice;
    },

    chompWhile: function (pattern) {
        var lastFoundOffset = this._offset;
        while (isPatternMatch(this._str.charAt(lastFoundOffset), pattern) &&
        lastFoundOffset < this._str.length) {
            lastFoundOffset++;
        }

        var slice = this._str.slice(this._offset, lastFoundOffset);
        this._offset = lastFoundOffset;
        return slice;
    },

    chompUntil: function (pattern) {
        var foundOffset = patternMatchIndexOf(this._str, pattern, this._offset),
            slice = this._str.slice(this._offset, foundOffset);
        this._offset = foundOffset + 1;
        return slice;
    },

    chompUntilBefore: function (pattern) {
        var foundOffset = patternMatchIndexOf(this._str, pattern, this._offset),
            slice = this._str.slice(this._offset, foundOffset);
        this._offset = foundOffset;
        return slice;
    },

    chompUntilIfExists: function (pattern) {
        var foundOffset = patternMatchIndexOf(this._str, pattern, this._offset);
        if (foundOffset === this._str.length) {
            return null;
        }

        var slice = this._str.slice(this._offset, foundOffset);
        this._offset = foundOffset + 1;
        return slice;
    },

    chompRemaining: function () {
        var slice = this._str.slice(this._offset);
        this._offset = this._str.length;
        return slice;
    },

    divideRemaining: function (length) {
        var slices = [];
        while (this.remaining()) {
            slices.push(this.chomp(length));
        }
        return slices;
    },

    search: function (pattern) {
        var index = this._str.search(pattern);
        if (index !== -1) {
            this.skip(index);
            return true;
        }
        return false;
    },

    toString: function () {
        return this._str.slice(0, this._offset) + '.' + this._str.slice(this._offset);
    }
};

module.exports = StringCursor;
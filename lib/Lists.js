'use strict'
const { setTimeout,clearTimeout } = require("sdk/timers");
var ss = require("sdk/simple-storage");

const TTL = 432000000; // 5gg

/**
 * Class list of the urls checked and functions
 * @param from
 * @constructor
 */
function URLCheckedList(from) {
    if (!from)
        this._list = {}, this.length = 0;
    else
        this._list = from._list, this.length = Object.keys(from._list).length;
}

/**
 * Load list from the local storage, or create a new one
 * @returns {URLCheckedList}
 */
URLCheckedList.load = function () {
    if (!ss.storage.checked)
        return new URLCheckedList();
    return new URLCheckedList(ss.storage.checked).cleanExpired();
};

/*
 * Functions of URLCheckedList class
 */
URLCheckedList.prototype = {
    insert: function (url, valid) {
        if (!this.exist(url))
            this._list[url] = {isvalid: valid, expiration: Date.now() + TTL}, this.length++;
    },

    exist: function (url) {
        return url in this._list;
    },

    isValid: function (url) {
        if (this.exist(url))
            return this._list[url].isvalid;
        return null;
    },

    isExpired: function (url) {
        if (this.exist(url))
            return this._list[url].expiration < Date.now();
        return null;
    },

    delete: function (url) {
        if (this.exist(url))
            delete this._list[url], this.length--;
    },

    cleanExpired: function () {
        for (let app in this._list)
            if (this.isExpired(app))
                this.delete(app);
        return this;
    },

    reset: function () {
        for (let app in this._list)
            this.delete(app);
    },

    save: function () {
        if (this.length == 0)
            return;
        if (!ss.storage.checked)
            ss.storage.checked = {};
        ss.storage.checked._list = this._list;
    }
};

/**
 * Class to store a whitelist
 * @param from
 * @constructor
 */
function WhiteList(from) {
    if (from)
        this._list = from._list, this.length = Object.keys(from._list).length;
    else
        this._list = {}, this.length = 0;
}

WhiteList.load = function () {
    if (!ss.storage.whiteList)
        return new WhiteList();
    return new WhiteList(ss.storage.whiteList);
};

WhiteList.prototype = {
    insert: function (url, persistent) {
        if (typeof persistent !== 'boolean')
            persistent = false;
        this._list[url] = persistent;
        if (!this.exist(url))
            this.length++;
    },

    exist: function (url) {
        return url in this._list;
    },

    isPersistent: function (url) {
        return this._list[url] || null;
    },

    delete: function (url) {
        if (this.exist(url))
            delete this._list[url], this.length--;
    },

    reset: function () {
        for (let app in this._list)
            this.delete(app);
    },

    clean: function () {
        for (let app in this._list)
            if (!this.isPersistent(app))
                this.delete(app);
    },

    save: function () {
        this.clean();
        if (this.length == 0)
            return;
        if (!ss.storage.whiteList)
            ss.storage.whiteList = {};
        ss.storage.whiteList = this._list;
    }
};

/**
 * A simple ArrayList and functions
 * @constructor
 */
function ArrayList() {
    this._list = [];
}

ArrayList.prototype = {
    insert: function (el) {
        if (!this.exist(el)) {
            this._list.push(el);
            return true;
        }
        return false;
    },

    delete: function (el) {
        let index;
        if ((index = this._list.indexOf(el)) !== -1)
            this._list.splice(index, 1);
    },

    reset: function () {
        this._list.splice(0, this.length());
    },

    exist: function (el) {
        return this._list.indexOf(el) !== -1;
    },

    length: function () {
        return this._list.length;
    },

    toArray: function () {
        if (this.length() > 0)
            return this._list;
        return null;
    }
};

/**
 * Simple list
 * @constructor
 */
function SimpleList() {
    this._list = {};
    this.length = 0;
}

SimpleList.prototype = {
    set: function (key, value) {
        if (!this.exist(key))
            this.length++;
        this._list[key] = value;
    },

    get: function (key) {
        return this._list[key] || null;
    },

    getKeys: function () {
        return Object.keys(this._list);
    },

    exist: function (key) {
        return key in this._list;
    },

    delete: function (key) {
        if (!this.exist(key))
            return;
        delete this._list[key];
        this.length--;
    },

    reset: function () {
        for (var app in this._list) {
            this.delete(app);
        }
    }
};

/**
 * Loglist with callback an timeout
 * @constructor
 */
function LogList(count) {
    this._list = {};
    this._listener = null;
    this._condition = null;
    this.length = 0;
    this.fire_count = count || 1;

    var timer = {time: null, fire_count: this.fire_count};

    /*
     condition must be a function that return true or false, of the type:
     function(list[tabId]){
     ** do something **
     if(some_condition)
     return true;
     else
     return false;
     }
     */
    this.timerOn = function (time, fire_count, condition) {
        if (time < 20000)
            throw new Error('TimerTime too small, choose a number >20000ms');
        timer.time = time;
        if (typeof fire_count === 'function')
            condition = fire_count, fire_count = null;
        if (fire_count)
            timer.fire_count = fire_count;
        if (typeof condition === 'function')
            this._condition = condition;
        else if (condition)
            throw new Error('Condition must be a function');
    };

    this.getTimer = function () {
        return timer;
    };

    this.getTimerTime = function () {
        return timer.time;
    };

    this.isTimerOn = function () {
        return timer.time !== null;
    };

    this.timerOff = function () {
        timer.time = null;
    };
}

LogList.COSTANTS = {STATUS: 0, URL: 1, URL_VALIDATION: 2, FORM_VALIDATION: 3, GOOGLE_VALIDATION: 4, WEKA: 5};

LogList.prototype = {
    insert: function (url) {
        if (!this._list[url]) {
            var _this = this.isTimerOn() ? this : null;
            this._list[url] = {
                array: [],
                timerId: this.isTimerOn() ? setTimeout(function () {
                    console.log('timeout');
                    if (_this.getTimer().fire_count === _this._list[url].count)
                        _this.complete(url);
                    else
                        _this.delete(url);
                }, _this.getTimerTime()) : null,
                count: 0
            };
            this.length++;
        }
    },

    set: function (url, array) {
        if (this._list[url]) {
            if (this.isTimerOn())
                clearTimeout(this._list[url].timerId), this._list[url].timerId = null;
            this._list[url].array = array.length === 1 ? this._list[url].array.concat(array) : array.concat(this._list[url].array);
            if (++this._list[url].count === this.fire_count)
                this.complete(url);
        }
        // else {
        //    var _this = this.isTimerOn() ? this : null;
        //    this._list[url] = {
        //        array: array,
        //        timerId: this.isTimerOn() ? setTimeout(function () {
        //            console.log('timeout');
        //            if (_this.getTimer().fire_count === _this._list[url].count)
        //                _this.complete(url);
        //            else
        //                _this.delete(url);
        //        }, _this.getTimerTime()) : null,
        //        count: 1
        //    };
        //    this.length++;
        //    if (this.fire_count === 1) {
        //        this.complete(url);
        //    }
        //}
    },

    setFireCount: function (fire_count) {
        if (fire_count < this.fire_count)
            for (let key in this._list)
                if (this._list[key].count >= fire_count)
                    this.complete(key);
        this.fire_count = fire_count;
    },

    getAll: function (url) {
        return this._list[url].array;
    },

    get: function (url, what) {
        return this._list[url].array[what];
    },

    exist: function (url) {
        return url in this._list;
    },

    delete: function (url) {
        if (!this.exist(url))
            return;
        if (this._list[url].timerId !== null)
            clearTimeout(this._list[url].timerId);
        delete this._list[url];
        this.length--;
    },

    reset: function () {
        for (let key in this._list)
            this.delete(key);
    },

    timeout: function (url) {
        this.complete(url);
    },

    /*
     condition must be a function that return true or false, of the type:
     function(list[tabId]){
     ** do something **
     if(some_condition)
     return true;
     else
     return false;
     }
     */
    onComplete: function (listener, condition) {
        if (typeof listener === 'function')
            this._listener = listener;
        else if (listener)
            throw new Error('Listener must be a function');
        if (typeof condition === 'function')
            this._condition = condition;
        else if (condition)
            throw new Error('Condition must be a function');
    },

    complete: function (url) {
        if (!this._listener)
            return;
        if (this._condition)
            if (!this._condition(this._list[url])) {
                this.delete(url);
                return;
            }
        var array = this.getAll(url);
        this.delete(url);
        this._listener(array);
    }
};

module.exports.SimpleList = SimpleList;
module.exports.ArrayList = ArrayList;
module.exports.WhiteList = WhiteList;
module.exports.URLCheckedList = URLCheckedList;
module.exports.LogList = LogList;
function Timer() {
    this._start = 0;
    this._stop = 0;
    this._intertime = [];
    this._closed = false;
}

Timer.prototype = {
    start: function () {
        if (this._closed)
            throw new Error('Timer closed, use reset() to reuse the same timer.');
        this._start = Date.now();
        return this;
    },

    reset: function () {
        this._start = 0;
        this._stop = 0;
        this._intertime = [];
        this._closed = false;
    },

    checkpoint: function () {
        if (this._closed)
            throw new Error('Timer closed, use reset() to reuse the same timer.');
        let app = this._stop === 0 ? this._start : this._stop;
        this._stop = Date.now();
        this._intertime.push(this._stop - app);
        return this._stop - app;
    },

    stop: function () {
        if (this._closed)
            throw new Error('Timer closed, use reset() to reuse the same timer.');
        let app = this._stop === 0 ? this._start : this._stop;
        this._stop = Date.now();
        this._intertime.push(this._stop - app);
        this._closed = true;
        return this._stop - app;
    }
};

module.exports = Timer;
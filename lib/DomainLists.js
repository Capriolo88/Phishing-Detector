'use strict'

const {Cu} = require("chrome"),
    {XMLHttpRequest} = require("sdk/net/xhr"),
    self = require("sdk/self");
var ss = require("sdk/simple-storage");
Cu.import("resource://gre/modules/Promise.jsm");

/**
 * reset local storage and actual cache
 */
function resetStorage() {
    for (let i in ss.storage)
        delete ss.storage[i];
    DomainCache._domain_cache = {};
    console.log('storage reset');
}

/**
 * Class DomainCache to store the more frequent controlled TLD
 * @constructor
 */
function DomainCache() {
}

DomainCache._domain_cache = {};
DomainCache._cache_expired = false;

/**
 * Insert a domain tree in cache
 * @static
 * @param domain name
 * @param tree tree
 */
DomainCache.set = function (domain, tree) {
    if (!(domain in DomainCache._domain_cache))
        DomainCache._domain_cache[domain] = {tree: tree, occ: 1};
};

/**
 * Return the tree associated to domain name
 * @static
 * @param domain name
 * @returns {string|null}
 */
DomainCache.get = function (domain) {
    if (domain in DomainCache._domain_cache) {
        if (DomainCache._domain_cache[domain].occ < 5)
            DomainCache._domain_cache[domain].occ++;
        return DomainCache._domain_cache[domain].tree;
    }
    return null;
};

/**
 * Save in simple-storage the domain cache
 * @static
 */
DomainCache.save = function () {
    for (let dom in DomainCache._domain_cache)
        if (DomainCache._domain_cache[dom].occ < 5)
            delete DomainCache._domain_cache[dom];
    if (Object.keys(DomainCache._domain_cache).length > 0) {
        if (!ss.storage.domainCache)
            ss.storage.domainCache = {}, ss.storage.domainCache.expiration = Date.now() + 864000000; //scadenza 10gg
        else if (DomainCache._cache_expired)
            DomainCache._cache_expired = false, ss.storage.domainCache.expiration = Date.now() + 864000000; //scadenza 10gg
        ss.storage.domainCache.list = DomainCache._domain_cache;
    }
};

/**
 * Load from the simple-storage the domain cache
 * @static
 */
DomainCache.load = function () {
    if (!ss.storage.domainCache)
        return;
    if (ss.storage.domainCache.expiration < Date.now())
        DomainCache._cache_expired = true;
    else
        DomainCache._domain_cache = ss.storage.domainCache.list;
};

/**
 * Class DomainList to load the list of public suffix from locale or https://publicsuffix.org/
 * @constructor
 */
function DomainList() {
    var _public_suffix_list = '';

    this.getList = function () {
        return _public_suffix_list;
    };

    this.setList = function (list) {
        _public_suffix_list = list;
    };
}

/**
 * Load the list
 */
DomainList.prototype.load = function () {
    var app = requestAndSave();
    if (typeof app !== 'string') {
        var _this = this;
        _this.setList(self.data.load('public_suffix_list.dat'));
        console.log('Promise');
        app.then((result)=> {
            _this.setList(result);
            console.log('resolved');
        }, (error)=> {
            console.log('rejected: ' + error);
        });
    } else {
        this.setList(app);
        console.log('string');
    }
};

/**
 * Perform the html request for the public_suffix_list
 * @returns {Promise} The promise of the list
 */
function request() {
    var deferred = Promise.defer(),
        XHR = new XMLHttpRequest();
    XHR.open('GET', 'https://publicsuffix.org/list/public_suffix_list.dat', true);
    XHR.onload = ()=> {
        if (XHR.status != 200)
            deferred.reject(XHR.statusText);
        else
            deferred.resolve(XHR.responseText);
    };
    XHR.send(null);
    return deferred.promise;
}

/**
 * Get the public suffix list from the localStorage if present, or perform an html request(to 'https://publicsuffix.org/'). In case of error the promise is rejected
 * @returns {string|Promise}
 */
function requestAndSave() {
    var public_suffix_list = Promise.defer();
    if (!ss.storage.publicsuffixlist) {
        console.log('non esiste');
        ss.storage.publicsuffixlist = {};
        request().then((str)=> {
            ss.storage.publicsuffixlist.value = str;
            ss.storage.publicsuffixlist.date = Date.now();
            public_suffix_list.resolve(str);
        }, (error)=> {
            public_suffix_list.reject(error);
        });
    } else {
        console.log('esiste');
        if (Date.now() - ss.storage.publicsuffixlist.date < 864000000) // scadenza 10gg
            return ss.storage.publicsuffixlist.value;
        else {
            console.log('scaduta');
            request().then((str)=> {
                ss.storage.publicsuffixlist.value = str;
                ss.storage.publicsuffixlist.date = Date.now();
                public_suffix_list.resolve(str);
            }, (error)=> {
                public_suffix_list.reject(error);
            });
        }
    }
    return public_suffix_list.promise;
}

module.exports.DomainCache = DomainCache;
module.exports.DomainList = DomainList;
module.exports.resetStorage = resetStorage;

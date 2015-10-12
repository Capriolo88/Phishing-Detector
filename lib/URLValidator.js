'use strict'

const {URL} = require("sdk/url"),
    self = require("sdk/self"),
    StringCursor = require("./StringCursor"),
    {DomainCache} = require("./DomainLists");

const key_words = ['secure', 'account', 'webscr', 'login', 'signin', 'banking', 'confirm', 'security', 'billing'],
    company_name = ['ebay', 'paypal', 'volksbank', 'wellsfargo', 'bankofamerica', 'privatebanking', 'hsbc', 'chase', 'amazon', 'banamex', 'barclays', 'poste'];

const VALID_PAGES_REGEXP = [new RegExp('^about\:'),
    new RegExp('^wyciwyg\:\/\/'),
    new RegExp('^http(s)?\:\/\/(.+\.)?mozilla\.(org|com|it)\/'),
    new RegExp('^http(s)?\:\/\/(.+\.)?google\.(com|it)\/'),
    new RegExp('^http(s)?\:\/\/(.+\.)?facebook\.(com|it)\/'),
    new RegExp('^http(s)?\:\/\/(.+\.)?youtube\.(com|it)\/'),
    new RegExp('^http(s)?\:\/\/(.+\.)?hotmail\.(com|it)\/'),
    new RegExp('^http(s)?\:\/\/(.+\.)?live\.(com|it)\/'),
    new RegExp('^http(s)?\:\/\/(.+\.)?msn\.(com|it)\/'),
    new RegExp('^http(s)?\:\/\/(.+\.)?yahoo\.(com|it)\/'),
    new RegExp('^http(s)?\:\/\/(.+\.)?phishtank\.(com)\/'),
    new RegExp('^resource\:\/\/')];

/**
 * Check if url is a secure one, from VALID_PAGES_REGEXP
 * @param url
 * @returns {boolean}
 */
function skippable(url) {
    for (let app of VALID_PAGES_REGEXP)
        if (app.test(url))
            return true;
    return false;
}

/**
 * Return the sublist of subdomain of the domain [TLD] if exist, null otherwise
 * @param {string} TLD domain (string) to check
 * @param {StringCursor} domains list of domains and sub-domains
 * @returns {string||Object||null} sublist of sub-domains of [TLD]
 */
function getTLDTree(TLD, domains) {
    var ret;
    if ((ret = DomainCache.get(TLD)))
        return {tree: ret, cache: true};
    if (!domains.search('\/\/ ' + TLD + ' (: )?'))
        return null;

    var slice = domains.chompRemaining();
    domains.clear();
    var offset = slice.slice(1).search(/\n\/\/ [a-z]+ : /);

    return offset === -1 ? null : slice.slice(0, offset);
}

/**
 * Clean tree from empty lines
 * @param tree
 * @returns {string} cleaned tree
 */
function cleanTLDTree(tree) {
    let app = tree.split('\n').map(mapTree), i = 0;
    while (i < app.length)
        app[i] !== '' ? i++ : app.splice(i, 1);
    return app.join('\n');
}

/**
 * Function to map in an array<string> every commented element (strings that begin with /) with ''
 * @param {string} str
 * @returns {string}
 */
function mapTree(str) {
    if (str.charAt(0) == '\/')
        return '';
    else
        return str;
}

/**
 * Check if a URL is possibly a phishing URL
 * @param {URL|string} url The URL to validate
 * @param {string} domainList List of known domain
 * @returns
 */
function URLValidator(url, domainList) {
    url = url instanceof URL ? url : URL(url);

    var res = {
        //smallUrl: url.protocol + '\/\/' + (url.userPass ? url.userPass + '@' : '') + url.hostname,
        levelDomains: [],
        domain: '',
        cond: {'ip': 0, 'at': 0, 'cgi': 0, 'hyphens': 0, 'key': 0, 'company': 0},
        points: 0,
        prob: 0,
        valid: true
    };

    var domain_list = new StringCursor(domainList.getList());
    var app_domain, tree, acceptAllsubDomain, app, max = 0, exception,
        host_elements = url.host.split('.');

    // Check for an ip address in url hostname
    if (/^(\d+|(\d{1,3}\.){3}\d{1,3})$/.test(url.host)) {
        res.cond.ip = 1;
        res.points += res.cond.ip;
    }

    // Check for '@' in the hostname
    if (url.userPass) {
        res.cond.at = res.cond.ip ? 2 : 1;
        if (url.userPass.search('%40') != -1)
            res.cond.at++, max++;
        res.points += res.cond.at;
    }

    let domain = '', ctrls = [false, false];
    // Check if there is invalid or more than one domain/subdomain
    for (var i = host_elements.length - 1; i >= 0 && res.cond.ip == 0; i--) {
        if (res.levelDomains.length > 1) {
            res.valid = false;
            res.cond = 'Multiple TLD o SLD';
            return res;
        }
        //exception = null;
        if (i != 0 && (tree = getTLDTree(host_elements[i], domain_list))) {
            app_domain = host_elements[i];
            if (typeof tree === 'string')
                tree = cleanTLDTree(tree), DomainCache.set(app_domain, tree);
            else
                tree = tree.tree;
            app = new StringCursor(tree);
            //while (app.search('\\![a-z]+')) {
            //    if (!exception)
            //        exception = [];
            //    app.skip(1);
            //    exception.push(app.chompUntil('\n'));
            //}
            while (i > 0) {
                acceptAllsubDomain = tree.search('\\*\\.' + app_domain) != -1;
                if (acceptAllsubDomain || tree.search(host_elements[i - 1] + '.' + app_domain) != -1) {
                    // exception utile solo per i cookies, per url vale come una regola normale
                    //if (exception && exception.indexOf(host_elements[i - 1] + '.' + app_domain) != -1)
                    //    break;
                    app_domain = host_elements[i - 1] + '.' + app_domain;
                    i--;
                    if (acceptAllsubDomain)
                        break;
                } else
                    break;
            }
            res.levelDomains.push(app_domain);
            if (domain === '')
                domain += app_domain;
        } else {
            if (domain != null)
                res.domain = host_elements[i] + '.' + domain, domain = null;
            // Check the presence of '-' in hostname
            let hyphens = host_elements[i].match(/-/g);
            if (hyphens && hyphens.length > 1) {
                if (ctrls[0])
                    max += 2;
                else
                    ctrls[0] = true;
                res.cond.hyphens += 2;
                res.points += 2;
            }
            // Check the presence of 'cgi' in hostname
            if (/*!res.points.cgi &&*/ host_elements[i].search(/cgi/) != -1) {
                if (ctrls[1])
                    max += 2;
                else
                    ctrls[1] = true;
                res.cond.cgi += 2;
                res.points += 2;
            }
        }
    }

    ctrls = false;
    // Search a key word in the url
    for (i = 0; i < key_words.length; i++) {
        if (url.href.search(key_words[i]) != -1) {
            if (ctrls)
                max++;
            else
                ctrls = true;
            res.cond.key++;
            res.points++;
        }
    }

    ctrls = false;
    // Search a company name in the url
    for (i = 0; i < company_name.length; i++) {
        if (url.href.search(company_name[i]) != -1) {
            if (ctrls)
                max++;
            else
                ctrls = true;
            res.cond.company++;
            res.points++;
        }
    }

    max = res.cond.ip == 1 ? max + 5 : max + 7;
    res.prob = (res.points / max) * 100;
    if (res.prob < 90)
        res.valid = 'maybe';
    else
        res.valid = false;

    return res;
}

module.exports.URLValidator = URLValidator;
module.exports.skippable = skippable;
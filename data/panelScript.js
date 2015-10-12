var url = '';

document.getElementById('ok').addEventListener('click', function (state) {
    self.postMessage({code: 'go'});
});

document.getElementById('more').addEventListener('click', function (state) {
    if (document.getElementById('more').innerHTML == '[...]') {
        document.getElementById('url').innerHTML = url;
        document.getElementById('more').innerHTML = '[]';
    } else {
        document.getElementById('more').innerHTML = '[...]';
        document.getElementById('url').innerHTML = url.slice(0, 50);
    }
});

self.on('message', function (message) {
    if (message.code === 'url') {
        document.getElementById('maybe').hidden = message.phish;
        if (message.url.length > 50) {
            url = message.url;
            document.getElementById('url').innerHTML = message.url.slice(0, 50);
            document.getElementById('more').hidden = false;
        } else {
            document.getElementById('more').hidden = true;
            document.getElementById('url').innerHTML = message.url;
        }
    }
});

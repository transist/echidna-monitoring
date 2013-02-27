'use strict';

var express = require('express');
var app = express();
var https = require('https');
var http = require('http');
var redis = require('redis');

var ECHIDNA_REDIS_HOST=process.env.ECHIDNA_REDIS_HOST || "127.0.0.1";
var ECHIDNA_REDIS_PORT=process.env.ECHIDNA_REDIS_PORT || 6379;
var ECHIDNA_REDIS_NAMESPACE=process.env.ECHIDNA_REDIS_NAMESPACE || 'e:d';
var ECHIDNA_MONITORING_IP=process.env.ECHIDNA_MONITORING_IP || "0.0.0.0";
var ECHIDNA_MONITORING_PORT=process.env.ECHIDNA_MONITORING_PORT || 0;

var NAMESPACE_MON = ECHIDNA_REDIS_NAMESPACE + ':mon';

function monitor(url, name) {
  var key = [NAMESPACE_MON, url, name].join(':');
  //console.log(key);
  return key;
}

function isRestricted(res) {
  return res.headers['www-authenticate'] === 'Basic realm="Restricted"';
}

function logMulti(err, replies) {
  if(err) return console.err(err);
  console.log("MULTI got " + replies.length + " replies");
  replies.forEach(function (reply, index) {
      console.log("Reply " + index + ": " + reply.toString());
  });
}

function noLogging(err, replies) {}

function checkUrl(redisClient, url, key, validate) {
  var data = '';
  https.get(url, function(res) {
    //console.log(res);
    //console.log(res.statusCode);
    res.on("data", function(chunk) {
      data = data + chunk;
    });
    res.on("end", function() {
      var valid = validate(res, data);
      if(!valid) {
        console.log('validation failed');
      }

      var multi = redisClient.multi();
      multi.set(monitor(key, 'status'), valid);
      multi.set(monitor(key, 'statusCode'), res.statusCode);
      multi.exec(noLogging);
    });
  });
}

function contains(re, res, data) {
  return data.match(re) != null;
}


var monitors = [
  monitor('secure', 'status'),
  monitor('secure', 'statusCode'),
  monitor('accessible', 'status'),
  monitor('accessible', 'statusCode')
];

app.get('/', function(req, res){
  res.setHeader('Content-Type', 'text/plain');
  var multi = redisClient.multi();
  monitors.forEach(function (key, index) {
    multi.get(key);
  });

  multi.exec(function(err, replies) {
    var acc = {};
    replies.forEach(function (reply, index) {
        //console.log("Reply " + index + ": " + reply.toString());
        var key = monitors[index].substr(NAMESPACE_MON.length + 1)
        acc[key] = reply.toString();
    });
    res.send(JSON.stringify(acc, null, '\t'));
    res.end();
  });
});

function main() {
  var server = http.createServer(app);
  var redisClient = redis.createClient(ECHIDNA_REDIS_PORT, ECHIDNA_REDIS_HOST);
  console.log('redis ' + ECHIDNA_REDIS_HOST + ':' + ECHIDNA_REDIS_PORT + ' namespace ' + ECHIDNA_REDIS_NAMESPACE)
  setInterval(checkUrl.bind(null, redisClient, 'https://echidna.transi.st', 'secure', isRestricted), 5000);
  var re =  /<\/html>/;
  setInterval(checkUrl.bind(null, redisClient, 'https://echidna.transi.st/SecretLocation', 'accessible', contains.bind(null, re)), 5000);
  server.listen(ECHIDNA_MONITORING_PORT, ECHIDNA_MONITORING_IP, function() {
    console.log('Listening on ' + server.address().address + ':' + server.address().port);
  });
}

if (require.main === module) {
  main();
}
/*
 * Ethereum Sandbox Helper
 * Copyright (C) 2016  <ether.camp> ALL RIGHTS RESERVED  (http://ether.camp)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License version 3 for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var fs = require('fs');
var https = require('https');

var MemoryStream = require('memorystream');
var requireFromString = require('require-from-string');
var _ = require('lodash');
var solc = require('solc');
var SolidityEvent = require("web3/lib/web3/event.js");

function getSolcVersion() {
  return solc.version();
}

function getSpecificSolc(solcVersion, cb) {
  var solcCacheDir = '.solc_cache';
  if (!fs.existsSync(solcCacheDir)) {
    fs.mkdirSync(solcCacheDir);
  }
  var solcCachePath = solcCacheDir + '/' + solcVersion;
  if (fs.existsSync(solcCachePath)) {
    var solcContent = fs.readFileSync(solcCachePath).toString();
    cb(null, solc.setupMethods(requireFromString(solcContent)));
    return;
  }
  var mem = new MemoryStream(null, {readable: false});
  var url = 'https://ethereum.github.io/solc-bin/bin/soljson-' + solcVersion + '.js';
  https.get(url, function (response) {
    if (response.statusCode !== 200) {
      cb(new Error('Error retrieving binary: ' + response.statusMessage));
    } else {
      response.pipe(mem);
      response.on('end', function () {
        var solcContent = mem.toString();
        fs.writeFileSync(solcCachePath, solcContent);
        cb(null, solc.setupMethods(requireFromString(solcContent)));
      });
    }
  }).on('error', function (error) {
    cb(new Error('Error getting solc: ' + error));
    return;
  });
}

function compile(dir, files, specificSolc) {
  if (!specificSolc) specificSolc = solc;

  console.log('Compiling files: ' + JSON.stringify(files));
  var input = _(files)
    .map(function(file) {
      return [file, fs.readFileSync(dir + '/' + file).toString()];
    })
    .fromPairs()
    .value();
  var output = specificSolc.compile({ sources: input }, 1, function findImports(path) {
    try {
      return { contents: fs.readFileSync(dir + '/' + path).toString() };
    } catch (e) {
      return { error: e };
    }
  });
  
  if (output.errors) throw output.errors;
  
  console.log('Comilation Success\n');
  return output;
}

function waitForReceipt(web3, txHash, cb) {
  var called = false;
  var blockFilter = web3.eth.filter('latest');
  blockFilter.watch(function() {
    web3.eth.getTransactionReceipt(txHash, function(err, receipt) {
      if (err) return cb(err);
      if (receipt) {
        if (called) return; // protection against double calling
        called = true;
        blockFilter.stopWatching();
        cb(null, receipt);
      }
    });
  });
}

function waitForSandboxReceipt(web3, txHash, cb) {
  var called = false;
  var blockFilter = web3.eth.filter('latest');
  blockFilter.watch(function() {
    web3.sandbox.receipt(txHash, function(err, receipt) {
      if (err) return cb(err);
      if (receipt) {
        if (called) return; // protection against double calling
        called = true;
        blockFilter.stopWatching();
        cb(null, receipt);
      }
    });
  });
}

function hexToString(hex) {
  return String.fromCharCode.apply(
    null,
    toArray(removeTrailingZeroes(hex.substr(2)))
  );
}

function parseEventLog(abi, eventLog) {
  var parsed;
  var topics = eventLog.topics;
  abi
    .filter(function (abiEntry) {
      return abiEntry.type == 'event';
    })
    .find(function (abiEntry) {
      var solidityEvent = new SolidityEvent(null, abiEntry, null);
      if (solidityEvent.signature() == topics[0].replace('0x', '')) {
        parsed = solidityEvent.decode(eventLog);
      }
  });
  return parsed;
}
 

function removeTrailingZeroes(str) {
  if (str.length % 2 !== 0) throw 'Wrong hex str: ' + str;
  
  var lastNonZeroByte = 0;
  for (var i = str.length - 2; i >= 2; i -= 2) {
    if (str.charAt(i) !== '0' || str.charAt(i + 1) !== '0') {
      lastNonZeroByte = i;
      break;
    }
  }
  
  return str.substr(0, lastNonZeroByte + 2);
}

function toArray(str) {
  if (str.length % 2 !== 0)
    console.error('Wrong hex str: ' + str);
  
  var arr = [];
  for (var i = 0; i < str.length; i += 2) {
    var code = parseInt(str.charAt(i) + str.charAt(i + 1), 16);
    // Ignore non-printable characters
    if (code > 9) arr.push(code);
  }
  
  return arr;
}

module.exports = {
  compile: compile,
  getSolcVersion: getSolcVersion,
  getSpecificSolc: getSpecificSolc,
  waitForReceipt: waitForReceipt,
  waitForSandboxReceipt: waitForSandboxReceipt,
  hexToString: hexToString,
  parseEventLog: parseEventLog
};

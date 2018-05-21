'use strict';

const fs = require('fs');

const ErowidReport = require('./erowidReport');

const reports = [
    'exp103423', 'exp108561', 'exp243', 'exp138'
];

reports
.map(a =>
    new ErowidReport(fs.readFileSync(a).toString()).toJSON()
)
.forEach(a =>
    console.log(require('util').inspect(a, {depth: null}))
);
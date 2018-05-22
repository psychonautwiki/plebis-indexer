'use strict';

const {MongoClient} = require('mongodb');
const elasticsearch = require('elasticsearch');

const esclient = new elasticsearch.Client({
    host: 'localhost:9200'
});

const wait = ms => new Promise(cb => setTimeout(cb, ms));

const esbucket = [];

let ntotal = 0;

(async () => {
    while(true) {
        await wait(500);

        if (esbucket.length === 0) {
            continue;
        }

        const sliceBucket = [].concat.apply([], esbucket.splice(0, 500));

        await esclient.bulk({
            body: sliceBucket
        });

        ntotal += sliceBucket.length;

        console.log('Indexed %s documents.. [%s]', sliceBucket.length, ntotal);
    }
})();

(async () => {
    const client = await MongoClient.connect('mongodb://127.0.0.1:27017');
    const db = client.db('plebiscite');
    const reportcoll = db.collection('reports');

    const reportcur = await reportcoll.find({});

    while(await reportcur.hasNext()) {
        const targetDoc = await reportcur.next();
        
        const reprocDoc = JSON.parse(JSON.stringify(targetDoc));
        const id = reprocDoc._id;

        delete reprocDoc._id;

        const indexOp = [
            { index:  { _index: 'reports', _type: 'report', _id: id } },
            reprocDoc
        ];

        esbucket.push(indexOp);
    }
})();


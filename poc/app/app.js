'use strict';

const Promise = require('bluebird');

const request = require('request-promise');
const Progress = require('progress');

const {MongoClient} = require('mongodb');

const mdb_delayed = Promise.promisify((url, cb) =>
    MongoClient.connect(url, cb)
);

const mongo_url = process.env.MONGO_URL || 'mongodb://localhost:27017/plebiscite';

const erowidUrl = id => `https://www.erowid.org/experiences/exp.php?ID=${id}`;
const wait = Promise.promisify((int, cb) => setTimeout(cb, int));

const ErowidReport = require('./erowidReport');

let i = 1;
const n = 200000;

const progress = new Progress(':current / :total :bar', { total: n });

Promise.coroutine(function* () {
    const db = yield mdb_delayed(mongo_url);
    const db_reports = db.collection('reports');

    const dbExists = function* (query) {
        return null !== (yield db_reports.findOne(query, {_id:1}));
    };

    /* create indices for mapping */

    // by erowidId
    yield db_reports.ensureIndex({
        'meta.published': -1,
        'meta.erowidId': -1
    }, {
        unique: true
    });

    // by substance
    yield db_reports.ensureIndex({
        'meta.published': -1,
        'substanceInfo.substance': -1
    });

    // by author
    yield db_reports.ensureIndex({
        'meta.published': -1,
        'author': -1
    });

    // by only date
    yield db_reports.ensureIndex({
        'meta.published': -1
    });

    for (let thread = 0; thread < 16; ++thread) {
        Promise.coroutine(function* () {
            while(i < n) {
                const id = i++;

                if (!(yield* dbExists({'meta.erowidId': id}))) {
                    try {
                        const res = yield request(erowidUrl(id));

                        const report = new ErowidReport(res);

                        if (!report.isHidden()) {
                            yield db_reports.updateOne({
                                'meta.erowidId': report.toJSON().meta.erowidId
                            }, {
                                $set: report.toJSON()
                            }, {
                                upsert: true
                            });
                        }

                        yield wait(500);
                    } catch(err) {
                        console.log(`Could not load exp '${id}'.`);
                    }
                }

                progress.tick();
            }
        })();
    }
})();
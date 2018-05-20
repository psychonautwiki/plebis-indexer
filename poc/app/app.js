'use strict';

const Promise = require('bluebird');

const request = Promise.promisify(require('request'));
const Progress = require('progress');

const {Iconv} = require('iconv');
const iso8859iconv = new Iconv('ISO-8859-1', 'utf-8');

const {MongoClient} = require('mongodb');

const mdb_delayed = Promise.promisify((url, cb) =>
    MongoClient.connect(url, cb)
);

const mongo_url = process.env.MONGO_URL || 'mongodb://localhost:27017/';

const erowidUrl = id => `http://erowid.org.global.prod.fastly.net/experiences/exp.php?ID=${id}`;
const wait = Promise.promisify((int, cb) => setTimeout(cb, int));

const ErowidReport = require('./erowidReport');

let i = 1;
const n = 200000;

const progress = new Progress(':current / :total :bar', { total: n });

(async () => {
    const client = await mdb_delayed(mongo_url);
    const db = client.db('plebiscite');

    const db_reports = db.collection('reports');

    const dbExists = async (query) =>
        (await db_reports.find(query, {_id:1}).limit(1)).length;

    /* create indices for mapping */

    // by erowidId
    await db_reports.ensureIndex({
        'meta.published': -1,
        'meta.erowidId': -1
    }, {
        unique: true
    });

    // by substance
    await db_reports.ensureIndex({
        'meta.published': -1,
        'substanceInfo.substance': -1
    });

    // by author
    await db_reports.ensureIndex({
        'meta.published': -1,
        'author': -1
    });

    // by only date
    await db_reports.ensureIndex({
        'meta.published': -1
    });

    for (let thread = 0; thread < 16; ++thread) {
        (async () => {
            while(i < n) {
                const id = i++;

                if (!(await dbExists({'meta.erowidId': id}))) {

                    try {
                        const res = await request({
                            url: erowidUrl(id),
                            encoding: null
                        });

                        const decoded_body = iso8859iconv.convert(res.body).toString('utf8');

                        const report = new ErowidReport(decoded_body);

                        if (!report.isHidden()) {
                            await db_reports.updateOne({
                                'meta.erowidId': report.toJSON().meta.erowidId
                            }, {
                                $set: report.toJSON()
                            }, {
                                upsert: true
                            });
                        }

                        await wait(500);
                    } catch(err) {
                        console.log(err);
                        console.log(`Could not load exp '${id}'.`);
                    }
                }

                progress.tick();
            }
        })();
    }
})();
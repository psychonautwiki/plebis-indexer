'use strict';

const cheerio = require('cheerio');
const $ = data => cheerio.load(data);

const assert = require('assert');

class ErowidReport {
    constructor(source) {
        this._raw_source = source;
        this._ctx = $(source);

        this._data = {};

        this._metaMap = new Map([
            ['exp year', 'year'],
            ['expid', 'erowidId'],
            ['gender', 'gender'],
            ['age at time of experience', 'age'],
            ['published', 'published'],
            ['views', 'views']
        ]);

        this._metaNumberFields = new Set([
            'year', 'views', 'age', 'erowidId'
        ]);

        this._divide_and_conquer();
    }

    _divide_and_conquer() {
        this._extract_general();
        this._extract_substance_info();
        this._extract_body();
        this._extract_meta();
    }

    _util_drop_newlines(text) {
        return text.replace(/\r?\n|\r/g, ' ');
    }

    _extract_general() {
        this._data.title = this._ctx('.title').text();
        this._data.substance = this._ctx('.substance').text();
        this._data.author = this._ctx('.author a').text();
    }

    _extract_substance_info() {
        const substance_fields = this._ctx('.dosechart tr');

        this._data.substanceInfo = [].slice.call(substance_fields.map((i, field) => {
            const substance_field = $(field);

            return {
                amount: substance_field('.dosechart-amount').text().trim(),
                method: substance_field('.dosechart-method').text().trim(),
                substance: substance_field('.dosechart-substance').text().trim(),
                form: substance_field('.dosechart-form').text().trim()
            };
        }));
    }

    _extract_body() {
        const body_skelleton = [
            '<guard>',
                this._raw_source.split('<!-- Start Body -->')
                                .pop()
                                .split('<!-- End Body -->')
                                .shift(),
            '</guard>'
        ].join('');

        const ctx_body = $(body_skelleton);

        /*
            (1) obtain erowid notes
            (2) obtain pull quotes
            (3) delete previous fields
            (4) extract text
        */

        const en_regex = /^\[Erowid Note: (.*?)\]$/;

        this._data.erowidNotes = [].slice.call(ctx_body('.erowid-caution').map((i, field) => {
            const noteText = this._util_drop_newlines($(field).text());

            return en_regex.test(noteText) ? noteText.match(en_regex)[1].trim()
                                           : noteText.trim();
        }));

        this._data.pullQuotes = [].slice.call(ctx_body('.pullquote-text').map((i, field) =>
            this._util_drop_newlines($(field).text()).trim()
        ));

        this._data.body = ctx_body('guard').remove('.erowid-caution')
                                           .remove('.pullquote-text')
                                           .text()
                                           .trim();
    }

    _extract_meta() {
        const meta_rows = [].slice.call(this._ctx('.footdata tr td').map((i, field) =>
            $(field).text().trim()
        ));

        const meta_set = {};

        meta_rows.forEach((row, row_i) => {
            const is_last_entry = meta_rows.length === row_i + 1;

            // The last entry of the meta data table: categorization
            // very rudimentary check for `... (<num>) : ...`
            if (is_last_entry && /(.*?) \([0-9]{1,6}\) : (.*?)$/.test(row)) {
                const categories_debug_msg = `Categories malformed! ${JSON.stringify(meta_set)}`;
                const attr_check_extract = str => {
                    assert(/^\([0-9]{1,6}$/.test(str.slice(str.lastIndexOf('('))), categories_debug_msg);

                    const [attribute, attributeId_raw] = str.split(' (');
                    
                    assert(!isNaN(attributeId_raw), categories_debug_msg);

                    const attributeId = parseInt(attributeId_raw, 10);

                    return [attribute, attributeId];
                };

                const [left, right] = row.split(') : ');

                assert(right !== undefined, categories_debug_msg);

                const categories = [];

                left.split('), ').forEach(category_raw => {
                    const [categoryName, categoryId] = attr_check_extract(category_raw);

                    categories.push({
                        name: categoryName,
                        id: categoryId
                    });
                });

                const attributes = [];

                right.split('), ').forEach((attribute_raw, i, items) => {
                    // the last attribute doesn't have its bracket cut off
                    const rawText = i + 1 !== items.length ? attribute_raw
                                                           : attribute_raw.slice(0, -1);

                    const [attributeName, attributeId] = attr_check_extract(rawText);

                    attributes.push({
                        name: attributeName,
                        id: attributeId
                    });
                });

                meta_set.erowidAttributes = {categories, attributes};

                return;
            }

            const [left, right] = row.toLowerCase().split(': ');

            const meta_field_mapping = this._metaMap.get(left);

            if (!meta_field_mapping) return;

            const right_trimmed = right.trim();

            if (this._metaNumberFields.has(meta_field_mapping)) {
                const parsedField = parseInt(right_trimmed, 10);

                meta_set[meta_field_mapping] = isNaN(parsedField) ? null : parsedField;

                return;
            }

            if (meta_field_mapping === 'published') {
                meta_set[meta_field_mapping] = new Date(right_trimmed);

                return;
            }

            if (meta_field_mapping === 'gender') {
                meta_set[meta_field_mapping] = right_trimmed === 'not specified' ? null : right_trimmed;

                return;
            }

            meta_set[meta_field_mapping] = right_trimmed;
        });

        this._data.meta = meta_set;
    }

    isHidden() {
        // title is hardcoded when exception occurs
        return this._ctx('title').text() === 'Erowid Experience Vaults: ';
    }

    toJSON() {
        return this._data;
    }
}

module.exports = ErowidReport;
/*
 * component-inventory
 * https://github.com/tilmanjusten/component-inventory
 *
 * Copyright (c) 2015 Tilman Justen
 * Licensed under the MIT license.
 */

'use strict';

var options = {};
var _ = require('lodash');
var template = require('lodash/string/template');
var path = require('path');
var util = require('util');
var InventoryObject = require('inventory-object');
var chalk = require('chalk');
var fs = require('fs');
var process = require('process');

// extend InventoryObject
InventoryObject.prototype.addUsage = function (value) {
    if (this.usage === undefined) {
        this.usage = [];
    }

    if (this.usage.indexOf(value) < 0) {
        this.usage.push(value);
    }
};

var ComponentInventory = function (_options) {
    // Merge task-specific and/or target-specific options with these defaults.
    options = _.assign({
        // Template file path
        template: path.resolve(__dirname, './tmpl/template.html'),
        // Storage file path
        storage: path.resolve(__dirname, './examples/component-inventory.json'),
        // Partial directory where individual partial files will be stored (relative to base)
        destPartials: './dist/partials',
        // Component inventory destination
        dest: {
            path: './dist',
            filename: 'component-inventory',
            ext: '.html',
            productionExt: '.html'
        },
        // Expand: create file per category
        expand: false,
        // Create partial files
        storePartials: false,
        // Partial extension when stored
        partialExt: '.html',
        // Category for items without category
        categoryFallback: 'No category',
        // Data destination
        destData: './dist/inventory.json'
    }, _options);

    //console.dir(InventoryObject);

    //process.exit();

    var templateFile;
    var storageFile;
    var renderingData = {
        items: [
            {
                name: 'Component name',
                partial: '<p>Partial code</p>'
            },
            {
                name: 'Another component',
                partial: '<div class="another-component">\n    <p>Another component</p>\n</div>'
            }
        ]
    };

    var tmpl;

    fs.accessSync(options.template, fs.R_OK, function(err) {
        console.log(chalk.yellow('Template file ' + options.template + ' is not readable.'));
        console.log(chalk.yellow(err));
    });

    fs.accessSync(options.storage, fs.R_OK, function(err) {
        console.log(chalk.yellow('Storage file ' + options.storage + ' is not readable.'));
        console.log(chalk.yellow(err));
    });

    console.log(chalk.white('Read template file ' + options.template));
    templateFile = fs.readFileSync(options.template, 'utf8');

    console.log(chalk.white('Read storage file ' + options.storage));
    storageFile = JSON.parse(fs.readFileSync(options.storage, 'utf8'));

    renderingData = prepareData(storageFile);

    // prepare template
    tmpl = template(templateFile, {imports: {'_': _}});

    // Split data by category
    var sections = renderingData.categories.map(function (category) {
        var renderingDataClone = util._extend({}, renderingData);

        renderingDataClone.categories = [];
        renderingDataClone.categories.push(category);
        renderingDataClone.itemLength = category.items.length;
        renderingDataClone.name = category.name;
        renderingDataClone.isIndex = false;

        return renderingDataClone;
    });

    var navigation = {
        category: '',
        index: options.dest.filename + options.dest.productionExt,
        items: [],
        lengthUnique: renderingData.lengthUnique,
        lengthTotal: renderingData.lengthTotal
    };

    navigation.items = sections.map(function (section) {
        //get id from section name (equals category name)
        var id = section.name.replace(/[^\w\d]+/ig, '').toLowerCase();
        // remove extension
        var filename = options.dest.filename + '--' + id;
        var item = {
            href: filename + options.dest.productionExt,
            name: section.name,
            itemLength: section.itemLength
        };

        section.dest = path.resolve(options.dest.path, filename + options.dest.ext);

        return item;
    });

    renderingData.navigation = navigation;

    console.log('');

    // Write index
    var destIndex = path.resolve(options.dest.path, options.dest.filename + options.dest.ext);
    var destPath = path.resolve(options.dest.path);

    // Create destination dir
    try {
        fs.accessSync(destPath, fs.R_OK);
    } catch (err) {
        console.log(chalk.green('Create destination directory: %s'), options.dest.path);
        fs.mkdirSync(destPath);
    }

    // write file per category and an index file
    if (options.expand) {
        // Write section inventories
        sections.forEach(function (section) {
            navigation.category = section.name;
            section.navigation = navigation;

            writeTemplate(section.dest, tmpl, section);
        });

        // empty category name for index
        navigation.category = '';

        writeTemplate(destIndex, tmpl, {navigation: navigation, isIndex: true, categories: []});
    } else {
        // write all components to single file
        writeTemplate(destIndex, tmpl, renderingData);
    }

    if (options.destData) {
        var data = {
            navigation: navigation
        };
        fs.writeFileSync(path.resolve(options.destData), JSON.stringify(data, null, '\t'), 'utf8');

        console.log(chalk.green('Stored data in ' + options.destData));
    }
};

/**
 * write template code to file
 *
 * @param dest
 * @param tmpl
 * @param data
 */
function writeTemplate(dest, tmpl, data) {
    var msg = data.isIndex ? 'Built inventory index in ' : 'Built component inventory in ';

    console.log(chalk.white('Write inventory to file ' + dest));

    fs.writeFileSync(dest, tmpl(data), 'utf8');

    console.log(chalk.green(msg + dest));
}

/**
 * get and prepare list of inventory items
 *
 * @param data
 * @returns {{options: (*|{}), categories: Array, isIndex: boolean, dest: string}}
 */
function prepareData(data) {
    if (typeof data !== 'object') {
        console.log(chalk.red('Item is not an object'));
        return;
    }

    var prepared = {
        options: data.options || {},
        categories: [],
        isIndex: true,
        dest: options.dest.path,
        lengthUnique: data.lengthUnique || 0,
        lengthTotal: data.lengthTotal || 0
    };
    var item;
    var uniquePartials = [];
    var uniqueViewPartials = [];

    _.forEach(data.items, function (el) {
        item = makeInventoryObject(el);

        if (!item) {
            return false;
        }

        // set default category to item
        item.category = item.category || options.categoryFallback;

        var categoryIndex = _.findIndex(prepared.categories, function (category) {
            return category.name === item.category;
        });
        var isDuplicate = false;

        if (categoryIndex < 0) {
            console.log(chalk.white('Create and prepare category ' + item.category));

            var categoryObj = {
                items: {},
                name: item.category
            };

            prepared.categories.push(categoryObj);
            // the index of the added item is the last one
            categoryIndex = prepared.categories.length - 1;
        }

        var categoryItems = prepared.categories[categoryIndex].items;

        // store unique partials
        if (uniquePartials.indexOf(item.id) < 0) {
            //item.addUsage(item.origin);
            uniquePartials.push(item.id);
            categoryItems[item.id] = item;
            console.log(chalk.green('Is not yet known: ' + item.id));
        } else {
            isDuplicate = true;
            console.log(chalk.red('Is duplicate: ' + item.id));
        }
        // add usage (itemIndex of first is 0)
        categoryItems[item.id].addUsage(item.origin);

        if (uniqueViewPartials.indexOf(item.viewId) < 0) {
            uniqueViewPartials.push(item.viewId);
        }

        // store partial if not already happen
        if (options.storePartials && !isDuplicate) {
            var filename = item.id + options.partialExt;
            fs.writeFileSync(path.resolve(options.destPartials, filename), item.template, 'utf8');
        }
    });

    // sort categories and items by name
    prepared.categories = _.sortBy(prepared.categories, 'name');

    prepared.categories.forEach(function (category) {
        category.items = _.sortBy(category.items, 'name');
    });

    console.log(chalk.white('Categories: ' + prepared.categories.length));
    console.log(chalk.white('Items: ' + uniquePartials.length));
    console.log(chalk.white('View items: ' + uniqueViewPartials.length));

    return prepared;
}

/**
 *
 * @param item
 * @returns {*}
 */
function makeInventoryObject(item) {
    if (!_.isPlainObject(item)) {
        console.log(chalk.red('Item is not an object'));
        return false;
    }

    return new InventoryObject(item);
}


module.exports = ComponentInventory;
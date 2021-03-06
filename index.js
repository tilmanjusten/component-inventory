'use strict';

var _ = require('lodash');
var template = require('lodash/template');
var path = require('path');
var util = require('util');
var InventoryObject = require('inventory-object');
var fs = require('fs-extra');
var ComponentInventory;

// Extend InventoryObject
InventoryObject.prototype.addUsage = function (value) {
    if (this.usage === undefined) {
        this.usage = [];
    }

    if (this.usage.indexOf(value) < 0) {
        this.usage.push(value);
    }
};

module.exports = ci;

function ci(options) {
    options = typeof options === 'object' ? options : {};

    return new ComponentInventory(options);
}

ComponentInventory = function (options) {
    // Merge task-specific and/or target-specific options with these defaults.
    this.options = Object.assign(this.defaultOptions, options);
};

ComponentInventory.prototype.defaultOptions = {
    // Template file path
    template: path.resolve(__dirname, './tmpl/template.html'),
    // Storage file path or data object
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
};

ComponentInventory.prototype.create = function (callback) {
    callback = typeof callback === 'function' ? callback : () => {};

    var templateFile;
    var storage;
    var renderingData;
    var tmpl;
    var sections;
    var navigation;
    var destIndex;
    var destPath;
    var options = this.options;

    // Rendering data examples
    renderingData = {
        items: [
            {
                name: 'Component name',
                lines: ['<p>Partial code</p>']
            },
            {
                name: 'Another component',
                lines: ['<div class="another-component">', '<p>Another component</p>\n</div>']
            }
        ]
    };
    fs.accessSync(this.options.template, fs.R_OK, function(err) {
        return callback(err, null);
    });

    // Assume path to JSON file
    if (typeof this.options.storage === 'string') {
        fs.accessSync(this.options.storage, fs.R_OK, function(err) {
            return callback(err, null);
        });

        storage = fs.readJsonSync(this.options.storage);
    } else if (typeof this.options.storage === 'object') {
        storage = this.options.storage;
    } else {
        return cb("Storage is neither file nor object", null);
    }

    renderingData = this.prepareData(storage);

    // Prepare template
    templateFile = fs.readFileSync(this.options.template, 'utf8');
    tmpl = template(templateFile, {imports: {'_': _}});

    // Split data by category
    sections = renderingData.categories.map(function (category) {
        const renderingDataClone = util._extend({}, renderingData);

        renderingDataClone.categories = [];
        renderingDataClone.categories.push(category);
        renderingDataClone.itemLength = category.items.length;
        renderingDataClone.name = category.name;
        renderingDataClone.isIndex = false;

        return renderingDataClone;
    });

    navigation = {
        category: '',
        index: this.options.dest.filename + this.options.dest.productionExt,
        items: [],
        lengthUnique: renderingData.lengthUnique,
        lengthTotal: renderingData.lengthTotal
    };

    navigation.items = sections.map(function (section) {
        // Get id from section name (equals category name)
        const id = section.name.replace(/[^\w\d]+/ig, '').toLowerCase();
        // Remove extension
        const filename = options.dest.filename + '--' + id;
        const item = {
            href: filename + options.dest.productionExt,
            name: section.name,
            itemLength: section.itemLength
        };

        // todo: Setting dest in every iteration?
        section.dest = path.resolve(options.dest.path, filename + options.dest.ext);

        return item;
    });

    renderingData.navigation = navigation;

    // Write index
    destIndex = path.resolve(this.options.dest.path, this.options.dest.filename + this.options.dest.ext);
    destPath = path.resolve(this.options.dest.path);

    // Create destination dir
	fs.ensureDirSync(destPath);

    // Write file per category and an index file
    if (this.options.expand) {
        // Write section inventories
        sections.forEach(function (section) {
            navigation.category = section.name;
            section.navigation = navigation;

            fs.writeFileSync(section.dest, tmpl(section), 'utf8');
        });

        // Empty category name for index
        navigation.category = '';

        fs.writeFileSync(destIndex, tmpl({navigation: navigation, isIndex: true, categories: []}), 'utf8');
    } else {
        // Write all components to single file
        fs.writeFileSync(destIndex, tmpl(renderingData), 'utf8');
    }

    if (this.options.destData) {
        var data = {
            navigation: navigation
        };

        fs.writeJsonSync(path.resolve(this.options.destData), data);
    }

    return callback(null, renderingData);
};

/**
 * Get and prepare list of inventory items
 *
 * @param data
 * @returns {{options: (*|{}), categories: Array, isIndex: boolean, dest: string}}
 */
ComponentInventory.prototype.prepareData = function (data) {
    if (typeof data !== 'object') {
        return {};
    }

    const prepared = {
            options: data.options || {},
            categories: [],
            isIndex: true,
            dest: this.options.dest.path,
            lengthUnique: data.lengthUnique || 0,
            lengthTotal: data.lengthTotal || 0
        };
    const uniquePartials = [];
    const uniqueViewPartials = [];
    const options = this.options;

    data.items.forEach(function (el) {
        let isDuplicate = false;
        const item = makeInventoryObject(el);

        if (!item) {
            return false;
        }

        // Set default category to item
        item.category = item.category || options.categoryFallback;

        let categoryIndex = prepared.categories.findIndex((category) => category.name === item.category);

        // create category if it does not exist
        if (categoryIndex < 0) {
            var categoryObj = {
                items: {},
                name: item.category
            };

            prepared.categories.push(categoryObj);
            // The index of the added item is the last one
            categoryIndex = prepared.categories.length - 1;
        }

        const categoryItems = prepared.categories[categoryIndex].items;

        // Store unique partials
        if (uniquePartials.indexOf(item.id) < 0) {
            uniquePartials.push(item.id);
            categoryItems[item.id] = item;
        } else {
            isDuplicate = true;
        }

        // Add usage (itemIndex of first is 0)
        categoryItems[item.id].addUsage(item.origin);

        if (uniqueViewPartials.indexOf(item.viewId) < 0) {
            uniqueViewPartials.push(item.viewId);
        }

        // Store partial if not already happened
        if (options.storePartials && !isDuplicate) {
            const filename = item.id + options.partialExt;
            const destinationPath = path.resolve(options.destPartials, filename);

            fs.ensureDir(path.dirname(destinationPath), function (err) {
                if (err === null) {
                    fs.writeFileSync(destinationPath, item.lines.join('\n'), 'utf8');
                }
            });
        }
    });

    // Sort categories and items by name
    prepared.categories = _.sortBy(prepared.categories, 'name');

    prepared.categories.forEach(function (category) {
        category.items = _.sortBy(category.items, 'name');
    });

    return prepared;
};

/**
 * Create inventory object from item
 *
 * @param item
 * @returns {*}
 */
function makeInventoryObject(item) {
    if (typeof item !== 'object') {
        return false;
    }

    return new InventoryObject(item);
}
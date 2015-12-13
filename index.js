'use strict';

var _ = require('lodash'),
    template = require('lodash/string/template'),
    path = require('path'),
    util = require('util'),
    InventoryObject = require('inventory-object'),
    fs = require('fs-extra'),
    ComponentInventory;

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

function noop() {

}

ComponentInventory = function (options, callback) {
    // Merge task-specific and/or target-specific options with these defaults.
    this.options = _.assign(this.defaultOptions, options);
};

ComponentInventory.prototype.create = function (callback) {
    var templateFile,
        storage,
        renderingData,
        tmpl,
        sections,
        navigation,
        destIndex,
        destPath,
        options = this.options;

    callback = typeof callback === 'function' ? callback : noop;

    // Rendering data examples
    renderingData = {
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
        var renderingDataClone = util._extend({}, renderingData);

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
        var id = section.name.replace(/[^\w\d]+/ig, '').toLowerCase(),
            // Remove extension
            filename = options.dest.filename + '--' + id,
            item = {
            href: filename + options.dest.productionExt,
            name: section.name,
            itemLength: section.itemLength
        };

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

/**
 * Get and prepare list of inventory items
 *
 * @param data
 * @returns {{options: (*|{}), categories: Array, isIndex: boolean, dest: string}}
 */
ComponentInventory.prototype.prepareData = function (data) {
    if (typeof data !== 'object') {
        return;
    }

    var prepared = {
            options: data.options || {},
            categories: [],
            isIndex: true,
            dest: this.options.dest.path,
            lengthUnique: data.lengthUnique || 0,
            lengthTotal: data.lengthTotal || 0
        },
        item,
        uniquePartials = [],
        uniqueViewPartials = [],
        options = this.options;

    _.forEach(data.items, function (el) {
        var categoryIndex,
            isDuplicate = false,
            categoryItems,
            filename;

        item = makeInventoryObject(el);

        if (!item) {
            return false;
        }

        // Set default category to item
        item.category = item.category || options.categoryFallback;

        categoryIndex = _.findIndex(prepared.categories, function (category) {
            return category.name === item.category;
        });

        if (categoryIndex < 0) {
            var categoryObj = {
                items: {},
                name: item.category
            };

            prepared.categories.push(categoryObj);
            // The index of the added item is the last one
            categoryIndex = prepared.categories.length - 1;
        }

        categoryItems = prepared.categories[categoryIndex].items;

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

        // Store partial if not already happen
        if (options.storePartials && !isDuplicate) {
            filename = item.id + options.partialExt;
            fs.writeFileSync(path.resolve(options.destPartials, filename), item.template, 'utf8');
        }
    });

    // Sort categories and items by name
    prepared.categories = _.sortBy(prepared.categories, 'name');

    prepared.categories.forEach(function (category) {
        category.items = _.sortBy(category.items, 'name');
    });

    //console.log(chalk.white('Categories: ' + prepared.categories.length));
    //console.log(chalk.white('Items: ' + uniquePartials.length));
    //console.log(chalk.white('View items: ' + uniqueViewPartials.length));

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
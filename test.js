'use strict';

var ComponentInventory = require('./index');

function callback(err, data) {
    if (err) {
        console.log("An error occured: ");
        console.log(err);

        return;
    }

    console.log("Component Inventory data:");
    console.log(data);
}

var ci = ComponentInventory({
    // Template file path
    //template: path.resolve(__dirname, './tmpl/template.html'),
    // Storage file path
    //storage: path.resolve(__dirname, './examples/component-inventory.json'),
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
    expand: true,
    // Create partial files
    storePartials: true,
    // Partial extension when stored
    partialExt: '.html',
    // Category for items without category
    categoryFallback: 'No category',
    // Data destination
    destData: './dist/inventory-sections.json'
});

ci.create(callback);

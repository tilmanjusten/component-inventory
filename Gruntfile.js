/*
 * grunt-component-inventory
 * https://github.com/tilman/component-inventory
 *
 * Copyright (c) 2015 Tilman Justen
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {

    // Project configuration.
    grunt.initConfig({
        clean: ['./dist'],

        jshint: {
            all: [
                'Gruntfile.js',
                'tasks/*.js'
            ],
            options: {
                jshintrc: '.jshintrc'
            }
        },

        // Configuration to be run (and then tested).
        'component-inventory': {
            test: {
                options: {
                    storage: 'examples/component-inventory.json',
                    dest: 'dist/component-inventory.html'
                }
            },

            test_expand: {
                options: {
                    storage: 'examples/component-inventory.json',
                    dest: 'dist/component-inventory.html',
                    expand: true
                }
            }
        }

    });

    // Actually load this plugin's task(s).
    grunt.loadTasks('tasks');

    // These plugins provide necessary tasks.
    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-jshint');

    // Whenever the "test" task is run, first clean the "tmp" dir, then run this
    // plugin's task(s), then test the result.
    grunt.registerTask('test', function (target) {
        target = target ? '_' + target : '';
        grunt.task.run(['jshint', 'component-inventory:test' + target]);
    });

    // By default, lint and run all tests.
    grunt.registerTask('default', ['jshint']);

    // development task
    grunt.registerTask('develop', ['clean', 'component-inventory:test_expand']);

};

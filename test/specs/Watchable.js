'use strict';

const makeWatchable = require('../../Watchable.js');

const Watchable = makeWatchable.Watchable;

const defineSuite = require('../suite');

describe('Watchable', function () {
    defineSuite(Watchable);
});

describe('Watchable.applyTo', function () {
    class Foo {}

    makeWatchable(Foo.prototype);

    defineSuite(Foo);
});
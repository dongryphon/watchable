# watchable

An enhanced event firing solution similar to `event-emitter`. While `watchable` can be
(almost) a drop-in replacement for `event-emitter`, its goal is to provide a better API
for doing more involved work.

For example:

![snippet](./docs/snippet1.png)

This is just one of the API improvements. There are many more described below!

## Substitution

You can generally drop in `watchable` as an enhanced `event-emiiter` module:

    const watchable = require('@epiphanysoft/watchable');
    
    function MyClass () { /* ... */ }
    
    watchable(MyClass.prototype);
    
    let inst = new MyClass();
    
    // ... use inst.on(), inst.off(), inst.once() and inst.emit()

There are some minor differences in how the extra utilities work (such as `pipe`,
`unify`, `all-off` and `has-listeners`).

# Expanded API

Watchable expands on the `event-emitter` API in the following ways:

 - Watchable ES6 base class.
 - Listener methods (not just functions).
 - Add/Remove multiple event listeners in one call.
 - Dynamic scope resolution.
 - Notification of transition to/from 0 listeners to events.
 - Flexible event relaying.

## Preferred API - Watchable Base Class

The `event-emitter` API is based on ES5 "classes", but `watchable` exports a proper ES6
class:

    const { Watchable } = require('@epiphanysoft/watchable');
    
    class MyClass extends Watchable {
        //...
    }
    
    let inst = new MyClass();
    let handler = x => console.log(x);
    
    inst.on('foo', handler);
    
    inst.fire('foo', 42);       // "emit" is an alias for "fire"
    
    inst.un('foo', handler);    // "off" is an alias for "un"

The use of `un()` instead of `off()` and `fire()` instead of `emit()` is a matter of
preference since both are supported. 

## Listener Methods

When uses classes, listener functions are inconvenient so `watchable` also supports
listener methods:

    class MyClass extends Watchable {
        //...
    }
    
    class MyWatcher {
        constructor () {
            this.prefix = '[watcher]';
        }
        
        onFoo (a) {
            console.log(this.prefix, a);
        }
    }
    
    let watchable = new MyClass();
    let watcher = new MyWatcher();
    
    watchable.on('foo', onFoo', watcher);

To remove a listener method you must supply the same instance:

    watchable.un('foo', onFoo', watcher);

## Multiple Listeners

The `unAll` method that will remove all listeners:

    watchable.unAll();

While useful, most cases require a more controlled approach.

Listening to multiple events from an object is a common need, so `watchable` has made
this simple:

    // listen to "foo" and "bar" events:
    watchable.on({
        foo () {
            //...
        },
        
        bar () {
            //...
        }
    });

The object passed to `on()` is called a "listener manifest". That same object can be
passed to `un()` to remove all of the listeners, but there is an easier way:

    let token = watchable.on({
        foo () {
            //...
        },
        
        bar () {
            //...
        }
    });
    
    // ...
    
    token.destroy();

By destroying the returned token (which is the only method it supports), all of the
corresponding listeners will be removed.

The same applies to listener methods:

    let token = watchable.on({
        foo: 'onFoo',
        bar: 'onBar',
        
        this: watcher
    });

The special key `this` in the listener manifest is understood to be the target object
of the listener methods.

A listener manifest can contain a mixture of method names and functions, but it is
generally best to use a consistent form at least on a per-call basis.

## Scope Resolution

When using listener methods, it can be convenient to have a default or named scope.

Consider these two cases:

    watchable.on({
        foo: 'onFoo',
        bar: 'onBar'
    });

    watchable.on({
        foo: 'onFoo',
        bar: 'onBar',
        
        this: 'parent'
    });

To enable the above, the instance involved must implement `resolveListenerScope`:

    class MyClass extends Watchable {
        //...

        resolveListenerScope (scope) {
            return (scope === 'parent') ? this.parent : this;
        }
    }

The full parameter list passed to `resolveListenerScope` is as below:

 - `scope`: The value of `this` on the listener manifest (if any).
 - `fn`: The handler function or method name (e.g., `'onFoo'`).
 - `listener`: The internal object tracking the `on()` request.

The `listener` argument is an `Array` that holds those values needed by the `watchable`
mechanism. The object can be useful to the `resolveListenerScope` method for holding
cached results on behalf of this particular listener. The `resolveListenerScope` method,
however, should not do any of the following with the `listeners` object:
 
 - Add or remove array elements.
 - Change any of the array element values.
 - Depend on any of the array element values.
 - Overwrite any of the array prototype methods.

Basically, `watchable` treats the `listeners` as the array it is and so long as that view
onto the object is preserved and handled as read-only, the `resolveListenerScope`
implementor is free to place expando properties on the same object for its own benefit.

## Listener Detection and Notification

Some expensive actions can be avoided using the `hasListeners` method:

    if (watchable.hasListeners('change')) {
        //... expensive stuff

        watchable.fire('change');
    }

Setting up to fire some events (say file-system observations) can come at a cost. In
these cases it is helpful to know when listeners are added or removed so that these
expensive setups can be delayed or avoided as well as cleaned up when no longer needed.

    class MyClass extends Watchable {
        //...

        onEventWatch (event) {
            // ... event had no listeners and now has one ...
        }
        
        onEventUnwatch (event) {
            // ... event had one listener and now has none ...
        }
    }

The `onEventWatch` and `onEventUnwatch` methods are optional and will be called if they
are implemented.

## Relaying Events

When relaying one event between watchable instances, there is always the manual solution:

    let watchable1 = new Watchable();
    let watchable2 = new Watchable();
    
    watchable1.on({
        foo (...args) {
            watchable2.fire('foo', ...args);
        }
    });

To relay all events fired by `watchable1`, however, requires a different approach. The
solution provided by `watchable` is an event relayer:

    const relayEvents = require('@epiphanysoft/watchable/relay');

The above `require` returns a function that can be used to create event relayers but it
also enables the latent `relayEvents` method which is already defined on all watchable
objects.

These are equivalent:

    relayEvents(watchable1, watchable2);
    
    watchable1.relayEvents(watchable2);

They both create an event relayer and register it with `watchable1`. The second form is
generally preferred since most of the operations provided by `watchable` are instance
methods. Basically, as long as some module issues a `require('.../watchable/relay)` then
the `relayEvent` method on all watchable instance will work properly.

Removing a relayer is similar to removing a listener manifest:

    let token = watchable1.relayEvents(watchable2);
    
    // ...
    
    token.destroy();

To relay multiple events, but not all events, `relayEvents` accepts an `options` argument:

    watchable1.relayEvents(watchable2, [
        'foo', 'bar'
    ]);

When `options` is an array, it is understood as an array of event names to relay. In this
case, only these events will be relayed.

The `options` argument can be an object whose keys are event names. The following is
equivalent to the array form above:

    watchable1.relayEvents(watchable2, {
        foo: true,
        bar: true
    });

To relay all events except `bar`:

    watchable1.relayEvents(watchable2, {
        '*': true,
        bar: false
    });

The special `'*'` pseudo event is used to change the default mapping of events not given
in the `options` object.

The values in the `options` object can be used to rename or transform individual events.

To relay `foo` without modification but rename the `bar` event to `barish`:

    watchable1.relayEvents(watchable2, {
        foo: true,
        bar: 'barish'
    });

To instead transform the `bar` event:

    watchable1.relayEvents(watchable2, {
        foo: true,
        
        bar (event, args) {
            return watchable2.fire('barish', ...args);
        }
    });

To relay all events and only transform `bar`:

    watchable1.relayEvents(watchable2, {
        '*': true,
        
        bar (event, args) {
            return watchable2.fire('barish', ...args);
        }
    });

To transform all events in one way, `options` can be a function:

    watchable1.relayEvents(watchable2, (event, args) => {
        return target.fire(event, ...args);
    });

For maximum flexibility, a custom relayer class can be written and an instance passed as
the first and only parameter to `relayEvents`:

    const { Relayer } = require('@epiphanysoft/watchable/relay');

    class MyRelayer extends Relayer {
        constructor (target) {
            super();
            this.target = target;
        }
        
        relay (event, args) {
            //...
        }
    }

    watchable1.relayEvents(new MyRelayer(watchable2));

In this case, `watchable1` will call the `relay()` method for all events it fires. The
`relay` method can then decide the particulars. All of the features described above can
be leveraged by calling `super.relay()` as long as the `constructor` passes the `options`
object to its `super()`.

## Utility Methods

The `watchable` module provides several helper functions that are directly exported. These
are mostly to mimic the `event-emitter` API since many equivalent capabilities are available
as described above.

These methods are:

    const { hasListeners, is, unAll } = require('@epiphanysoft/watchable');
    const pipe = require('@epiphanysoft/watchable/pipe');
    const unify = require('@epiphanysoft/watchable/unify');

The `hasListeners` and `unAll` methods are also available as instance methods of watchable
objects.

### hasListeners

    hasListeners (watchable, event);

Returns `true` if the `watchable` instance has one ore more listeners for `event`.

### is

    is (candidate);

Returns `true` if the `candidate` is a watchable object.

### pipe

    pipe (watchable1, watchable2);

Relays all events fired on `watchable1` to `watchable2`. This is an `event-emitter` name
for the `relayEvents` method described above:

    pipe (watchable1, watchable2) {
        return watchable1.relayEvents(watchable2);
    }

### unAll

    unAll (watchable);

Removes all listeners on the `watchable` instance.

### unify

    unify (watchable1, watchable2);

This (non-reversibly) connects the listeners of the two watchable instances. This is done
by sharing the listener registrations. This means that listeners registered on one
instance will be in fact be registered on both. This has the effect that which ever of
these instances is used to `fire()` an event, all listeners will be invoked, regardless of
the instance on which they appear to be registered.

To `unify()` multiple watchable instances, it is important to always pass one of the
current group members as the first argument:

    // OK
    unify (watchable1, watchable2);
    unify (watchable1, watchable3);

    // BAD
    unify (watchable1, watchable2);
    unify (watchable3, watchable2);

This is because preference is given to the first watchable object when merging.

# Extending Watchable

For all of its features, `watchable` is rather small so there is room for enhancement by
other modules.

To facilitate such enhancements, the entire Mocha test suite is exported to allow such
modules to verify compliance with the full `watchable` interface contract:

    const { Watchable } = require('@epiphanysoft/watchable');

    class MyWatchable extends Watchable {
    }

    //---

    const watchableTestSuite = require('@epiphanysoft/watchable/test/suite');

    describe('MyWatchable', function () {
        watchableTestSuite(MyWatchable);
    });

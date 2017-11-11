'use strict';

const Relayer = require('./Relayer.js');

const actualFnSym = Symbol('actualListener');
const firingSym = Symbol('eventFiring');
const watchersSym = Symbol('eventWatchers');
const STOP = Symbol('stopFiring');

function Empty (props) {
    if (props) {
        Object.assign(this, props);
    }
}

Empty.prototype = Object.create(null);

//----------------------------------------

class Token {
    constructor (instance) {
        this.watchable = instance;
        this.entries = [];
    }

    close () {
        this.destroy();
    }

    destroy () {
        let instance = this.watchable;
        let inform = instance.onEventUnwatch;
        let watcherMap = instance[watchersSym];
        let entry, index, name, watchers;

        if (watcherMap) {
            for (entry of this.entries) {
                watchers = watcherMap[name = entry[2]];

                if (watchers && firingSym in watchers) {
                    if ((index = watchers.indexOf(entry)) > -1) {
                        if (watchers[firingSym]) {
                            watcherMap[name] = watchers = watchers.slice();
                            watchers[firingSym] = 0;
                        }

                        if (watchers.length > 1) {
                            watchers.splice(index, 1);
                        }
                        else {
                            watcherMap[name] = null;
                        }
                    }
                }
                else if (watchers === entry) {
                    watcherMap[name] = null;
                }

                if (instance.onEventUnwatch && !watcherMap[name]) {
                    instance.onEventUnwatch(name);
                }
            }
        }
    }
}

function call (fn, scope, args) {
    return scope ? (fn.charAt ? scope[fn](...args) : fn.call(scope, ...args)) : fn(...args);
}

function on (instance, watcherMap, name, fn, scope, token) {
    let watchers = watcherMap[name];
    let added = [fn, scope];
    let actualFn, entry;

    if (watchers && firingSym in watchers) {
        // Ignore duplicate registrations
        for (entry of watchers) {
            actualFn = entry[0];
            actualFn = actualFn[actualFnSym] || actualFn;

            if (actualFn === fn && (scope ? entry[1] === scope : !entry[1])) {
                return;
            }
        }

        if (watchers[firingSym]) {
            watcherMap[name] = watchers = watchers.slice();
            watchers[firingSym] = 0;
        }

        watchers.push(added);
    }
    else if (watchers) {
        actualFn = watchers[0];
        actualFn = actualFn[actualFnSym] || actualFn;

        if (actualFn === fn && (scope ? watchers[1] === scope : !watchers[1])) {
            return;
        }

        watcherMap[name] = watchers = [watchers, added];
        watchers[firingSym] = 0;
    }
    else {
        watcherMap[name] = added;

        if (instance.onEventWatch) {
            instance.onEventWatch(name);
        }
    }

    if (token) {
        token.entries.push(added);
        added.push(name);
    }
}

function un (instance, watcherMap, name, fn, scope) {
    let watchers = watcherMap[name];
    let actualFn, entry, i;

    if (watchers) {
        if (firingSym in watchers) {
            if (watchers[firingSym]) {
                watcherMap[name] = watchers = watchers.slice();
                watchers[firingSym] = 0;
            }

            for (i = watchers.length; i-- > 0;) {
                entry = watchers[i];
                actualFn = entry[0];
                actualFn = actualFn[actualFnSym] || actualFn;

                if (actualFn === fn && (scope ? entry[1] === scope : !entry[1])) {
                    if (watchers.length > 1) {
                        watchers.splice(i, 1);
                    }
                    else {
                        watcherMap[name] = null;
                    }

                    break;  // duplicates are prevents by on()
                }
            }
        }
        else {
            actualFn = watchers[0];
            actualFn = actualFn[actualFnSym] || actualFn;

            if (actualFn === fn && (scope ? watchers[1] === scope : !watchers[1])) {
                watcherMap[name] = null;
            }
        }

        if (instance.onEventUnwatch && !watcherMap[name]) {
            instance.onEventUnwatch(name);
        }
    }
}

function update (instance, updater, name, fn, scope) {
    let watcherMap = instance[watchersSym];
    let add = updater === on;
    let token = null;

    if (!watcherMap) {
        if (!add) {
            return token;
        }

        instance[watchersSym] = watcherMap = new Empty();
    }

    scope = scope || null;

    if (typeof name === 'string') {
        updater(instance, watcherMap, name, fn, scope);
    }
    else {
        // "name" is a manifest object of watchers

        token = add && new Token(instance);
        scope = name.scope;

        for (let s of Object.keys(name)) {
            if (!Watchable.options[s]) {
                updater(instance, watcherMap, s, name[s], scope, token);
            }
        }
    }

    return token;
}

//----------------------------------------

const descriptors = {};

class Watchable {
    static allOff (instance, event) {
        proto.unAll.call(instance, event);
    }

    static applyTo (target) {
        Object.defineProperties(target, descriptors);
        target[watchersSym] = null;
    }

    static hasListeners (instance, event) {
        return proto.hasListeners.call(instance, event);
    }

    static is (instance) {
        return instance && instance[watchersSym] !== undefined;
    }

    static unify (inst1, inst2) {
        let map1 = inst1[watchersSym];
        let map2 = inst2[watchersSym];
        let replacement, to;

        if (map1) {
            if (map2 && map1 !== map2) {
                for (let event of Object.keys(map2)) {
                    let from = map2[event];

                    if (from) {
                        if (!(to = map1[event])) {
                            map1[event] = from;

                            if (inst1.onEventWatch) {
                                inst1.onEventWatch(event);
                            }
                        }
                        else {
                            let multiFrom = firingSym in from;

                            map1[event] = replacement = (firingSym in to) ?
                                (multiFrom ? [...to, ...from] : [...to, from]) :
                                (multiFrom ? [to, ...from] : [to, from]);

                            replacement[firingSym] = 0;
                        }
                    }
                }
            }

            inst2[watchersSym] = map1;
        }
        else {
            inst1[watchersSym] = map2 || (inst2[watchersSym] = new Empty());

            //TODO if (inst1.onEventWatch)
        }
    }

    emit (event, ...args) {
        return this.fire(event, ...args);
    }

    fire (event, ...args) {
        let watcherMap = this[watchersSym];
        let watchers = watcherMap && watcherMap[event];
        let ret;

        if (watchers && firingSym in watchers) {
            ++watchers[firingSym];

            for (let entry of watchers) {
                if (call(entry[0], entry[1], args) === STOP) {
                    ret = STOP;
                    break;
                }
            }

            --watchers[firingSym];
        }
        else if (watchers) {
            if (call(watchers[0], watchers[1], args) === STOP) {
                ret = STOP;
            }
        }

        if (ret !== STOP) {
            let relayers = this[Relayer.SYMBOL];

            if (relayers) {
                ++relayers[firingSym];

                for (let relay of relayers) {
                    relay.relay(event, args);
                }

                --relayers[firingSym];
            }
        }

        return ret;
    }

    hasListeners (event) {
        let watcherMap = this[watchersSym];
        return !!(watcherMap && watcherMap[event]);
    }

    on (name, fn, scope) {
        return update(this, on, name, fn, scope);
    }

    once (name, fn, scope) {
        const me = this;

        function onceFn (...args) {
            update(me, un, name, fn, scope);
            call(fn, scope, args);
        }

        onceFn[actualFnSym] = fn;

        return update(me, on, name, onceFn, scope);
    }

    off (name, fn, scope) {
        return update(this, un, name, fn, scope);
    }

    /**
        watchable.relayEvents(target);  // all event

        watchable.relayEvents(target, [
            'foo', 'bar'
        ]);

        watchable.relayEvents(target, {
            foo: true,     // relayed as "foo"
            bar: 'barish'  // relayed as "barish"
        });

        watchable.relayEvents(target, {
            foo (event, args) {
                // called to relay "event" to "target" with "args"
                return target.fire(event, ...args);
            }
        });

        watchable.relayEvents(target, (event, args) => {
            // called to relay "event" to "target" with "args"
            return target.fire(event, ...args);
        });
     */
    relayEvents (target, options) {
        return Relayer.create(this, target, options);
    }

    un (name, fn, scope) {
        return update(this, un, name, fn, scope);
    }

    unAll (event) {
        let watcherMap = this[watchersSym];

        if (event) {
            if (watcherMap[event]) {
                watcherMap[event] = null;
            }
        }
        else {
            for (let key of watcherMap) {
                watcherMap[key] = null;
            }
        }
    }
}

let proto = Watchable.prototype;

for (let name of Object.getOwnPropertyNames(proto)) {
    if (name !== 'constructor') {
        descriptors[name] = Object.getOwnPropertyDescriptor(proto, name);
    }
}

proto[watchersSym] = null;

Watchable.options = new Empty({
    scope: true
});

Watchable.Relayer = Relayer;

Watchable.symbols = {
    actualFn: actualFnSym,
    firing:   firingSym,
    watchers: watchersSym
};

Watchable.STOP = STOP;

module.exports = Watchable;


// Interpolation disabled for now
// var interpolate = require('./core/interpolate');
// var cssFeature = require('feature/css');

var timeline = require('./core/timeline');
var dynamics = require('./core/dynamics');
var easingFunctions = require('./core/easing-functions');

var extend = require('./util/extend');
var uid = require('./util/uid');
var EventEmitter = require('./util/simple-emitter');

function clamp(min, n, max) { return Math.max(min, Math.min(n, max)); }
function identity(n) { return n; }

var VELOCITY_MIN = 0.01;

module.exports = Animation;

function Animation(opts) {
  //if `new` keyword isn't provided, do it for user
  if (!(this instanceof Animation)) {
    return new Animation(opts);
  }
  var self = this;

  opts = opts || {};

  //Private state goes in this._
  this._ = {
    id: uid(),
    percent: 0,
    duration: 500,
    inverted: false,
    distance: 100,
    deceleration: 0.998,
    velocity: 0
  };

  var emitter = this._.emitter = new EventEmitter();
  this._.onDestroy = function() {
    emitter.emit('destroy');
  };
  this._.onStop = function(wasCompleted) {
    emitter.emit('stop', wasCompleted);
    wasCompleted && emitter.emit('complete');
  };
  this._.onStart = function() {
    emitter.emit('start');
  };

  var precision = 10000;
  this._.onStep = function(v) {
    emitter.emit(
      'step', 
      Math.round((self._.inverted ? 1 - v : v) * precision) / precision
    );
  };

  opts.duration && this.duration(opts.duration);
  opts.percent && this.percent(opts.percent);
  opts.easing && this.easing(opts.easing);
  opts.inverted && this.inverted(opts.inverted);
  opts.distance && this.distance(opts.distance);
 
  //Put this here so we don't have to call _tick in the context of our object.
  //Avoids having to use .bind() or .call() every frame.
  self._tick = function(deltaT) {
    var state = self._;
    
    state.onStep(animStepValue(self, state.percent));

    if (state.percent === 1 || 
       (state.hasVelocity && (state.percent === 0 || Math.abs(state.velocity) < VELOCITY_MIN))) {
      state.velocity = 0;
      state.hasVelocity = false;
      return self.stop();
    }

    if (!deltaT) {
      // Do nothing
    } else if (state.hasVelocity) {
      var velocity = decayVelocity(state.velocity, deltaT, state.deceleration);
      var currentDistance = state.percent * state.distance;
      state.percent = (currentDistance + velocity) / state.distance;
      state.velocity = velocity;
    } else {
      state.percent += (deltaT / state.duration);
    }

    state.percent = clamp(0, state.percent, 1);
  };
}

Animation.prototype = {
  inverted: function(inverted) {
    if (arguments.length) {
      this._.inverted = !!inverted;
      return this;
    }
    return this._.inverted;
  },

  easing: function(easing) {
    var type = typeof easing;
    if (arguments.length) {
      if (type === 'function' || type === 'string' || type === 'object') {
        this._.easing = this._.easingFn = figureOutEasing(easing);
      }
      return this;
    }
    return this._.easingFn;
  },

  transitionEasingTo: function(newEasing) {
    var self = this;
    var oldEasing = self._.easingFn;
    self._.easing = figureOutEasing(newEasing);
    var startPercent = self._.percent;
    var startEasingValue = oldEasing && oldEasing(self._.percent) || 0;
    var compression = self._.percent === 1 ?  1 : 1 / (1 - self._.percent);

    self._.easingFn = function(percent, duration) {
      var compressedPercent = compression * (percent - startPercent);
      var result = self._.easing(compressedPercent, duration);
      return startEasingValue + result * (1-startEasingValue);
    };

    return self;
  },

  percent: function(percent, immediate) {
    var self = this;
    if (arguments.length) {
      if (typeof percent === 'number') {
        this._.percent = clamp(0, percent, 1);
      }
      if (!this.isRunning()) {
        if (immediate) {
          this._tick();
        } else {
          timeline.tickAction(this._.id, function() {
            self._tick();
            timeline.untickAction(self._.id);
          });
        }
      }
      return this;
    }
    return this._.percent;
  },

  distance: function(distance) {
    if (arguments.length) {
      if (typeof distance === 'number' && distance > 0) {
        this._.distance = distance;
      }
      return this;
    }
    return this._.distance;
  },

  deceleration: function(deceleration) {
    if (arguments.length) {
      if (typeof deceleration === 'number' && deceleration > 0 && deceleration < 1) {
        this._.deceleration = deceleration;
      }
      return this;
    }
    return this._.deceleration;
  },

  duration: function(duration) {
    if (arguments.length) {
      if (typeof duration === 'number' && duration > 0) {
        this._.duration = duration;
      }
      return this;
    }
    return this._.duration;
  },

  isRunning: function() { 
    return !!this._.isRunning; 
  },

  promise: function() {
    var self = this;
    return {
      then: function(cb) {
        self.once('stop', cb);
      }
    };
  },

  on: function(eventType, listener) {
    this._.emitter.on(eventType, listener);
    return this;
  },
  once: function(eventType, listener) {
    this._.emitter.once(eventType, listener);
    return this;
  },
  off: function(eventType, listener) {
    this._.emitter.off(eventType, listener);
    return this;
  },

  destroy: function() {
    this.stop();
    this._.onDestroy();
    this.off();
    return this;
  },

  stop: function() {
    if (!this._.isRunning) return;

    this._.isRunning = false;
    timeline.untickAction(this._.id);

    this._.onStop(animIsComplete(this));
    return this;
  },

  restart: function(immediate) {
    this._.percent = 0;
    //Decompress easing fn if it's compressed
    this._.easingFn = this._.easing;
    return this.start(!!immediate);
  },

  start: function(immediate) {
    if (animIsComplete(this)) return;
    return animBegin(this, immediate);
  },

  velocity: function(velocity, immediate) {
    if (animIsComplete(this)) return;
    this._.velocity = velocity;
    this._.hasVelocity = true;
    return animBegin(this, immediate);
  }
};

function animBegin(animation, immediate) {
  if (immediate) {
    animation._tick();
  }

  animation._.isRunning = true;
  timeline.tickAction(animation._.id, animation._tick);

  animation._.onStart();
  return animation;
}
function animIsComplete(animation) {
  return !animation._.isRunning && animation._.percent === 1;
}
function animStepValue(animation, value) {
  if (animation._.easingFn) {
    return animation._.easingFn(value, animation._.duration);
  }
  return value;
}

function decayVelocity(velocity, dt, deceleration) {
  var kv = Math.pow(deceleration, dt);
  return velocity * kv;
}

function figureOutEasing(easing) {
  if (typeof easing === 'object') {
    var dynamicType = typeof easing.type === 'string' &&
      easing.type.toLowerCase().trim();

    if (!dynamics[dynamicType]) {
      throw new Error(
        'Invalid easing dynamics object type "' + easing.type + '". ' +
        'Available dynamics types: ' + Object.keys(dynamics).join(', ') + '.'
      );
    }
    return dynamics[dynamicType](easing);

  } else if (typeof easing === 'string') {
    easing = easing.toLowerCase().trim();
    
    if (easing.indexOf('cubic-bezier(') === 0) {
      var parts = easing
        .replace('cubic-bezier(', '')
        .replace(')', '')
        .split(',')
        .map(function(v) {
          return v.trim();
        });
      return easingFunctions['cubic-bezier'](parts[0], parts[1], parts[2], parts[3]);
    } else {
      var fn = easingFunctions[easing];
      if (!fn) {
        throw new Error(
          'Invalid easing function "' + easing + '". ' +
          'Available easing functions: ' + Object.keys(easingFunctions).join(', ') + '.'
        );
      }
      return easingFunctions[easing]();
    }
  } else if (typeof easing === 'function') {
    return easing;
  }
}

// /*
//  * Tweening helpers
//  */
// function syncStyles(startingStyles, endingStyles, computedStyle) {
//   var property;
//   for (property in startingStyles) {
//     if (!endingStyles.hasOwnProperty(property)) {
//       delete startingStyles[property];
//     }
//   }
//   for (property in endingStyles) {
//     if (!startingStyles.hasOwnProperty(property)) {
//       startingStyles[property] = computedStyle[vendorizePropertyName(property)];
//     }
//   }
// }

// function makePropertyInterpolators(startingStyles, endingStyles) {
//   var interpolators = {};
//   var property;
//   for (property in startingStyles) {
//     interpolators[vendorizePropertyName(property)] = interpolate.propertyInterpolator(
//       property, startingStyles[property], endingStyles[property]
//     );
//   }
//   return interpolators;
// }

// var transformProperty;
// function vendorizePropertyName(property) {
//   if (property === 'transform') {
//     //Set transformProperty lazily, to be sure DOM has loaded already when using it
//     return transformProperty || 
//       (transformProperty = cssFeature('transform').property);
//   } else {
//     return property;
//   }
// }

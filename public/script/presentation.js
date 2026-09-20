/*
 * Hammer.JS version 0.6.1
 */
function Hammer(element, options, undefined) {
    var self = this;

    var defaults = {
        // prevent the default event or not... might be buggy when false
        prevent_default    : false,
        css_hacks          : true,
        cancel_event       : true,

        swipe              : true,
        swipe_time         : 200,   // ms
        swipe_min_distance : 20, // pixels

        drag               : true,
        drag_vertical      : true,
        drag_horizontal    : true,
        // minimum distance before the drag event starts
        drag_min_distance  : 20, // pixels

        // pinch zoom and rotation
        transform          : true,
        scale_treshold     : 0.1,
        rotation_treshold  : 15, // degrees

        tap                : true,
        tap_double         : true,
        tap_max_interval   : 300,
        tap_max_distance   : 10,
        tap_double_distance: 20,

        hold               : true,
        hold_timeout       : 500
    };
    options = mergeObject(defaults, options);

    // some css hacks
    (function() {
        if(!options.css_hacks) {
            return false;
        }

        var vendors = ['webkit','moz','ms','o',''];
        var css_props = {
            "userSelect": "none",
            "touchCallout": "none",
            "userDrag": "none",
            "tapHighlightColor": "rgba(0,0,0,0)"
        };

        var prop = '';
        for(var i = 0; i < vendors.length; i++) {
            for(var p in css_props) {
                prop = p;
                if(vendors[i]) {
                    prop = vendors[i] + prop.substring(0, 1).toUpperCase() + prop.substring(1);
                }
                element.style[ prop ] = css_props[p];
            }
        }
    })();

    // holds the distance that has been moved
    var _distance = 0;

    // holds the exact angle that has been moved
    var _angle = 0;

    // holds the diraction that has been moved
    var _direction = 0;

    // holds position movement for sliding
    var _pos = { };

    // how many fingers are on the screen
    var _fingers = 0;

    var _first = false;

    var _gesture = null;
    var _prev_gesture = null;

    var _touch_start_time = null;
    var _prev_tap_pos = {x: 0, y: 0};
    var _prev_tap_end_time = null;

    var _hold_timer = null;

    var _offset = {};

    // keep track of the mouse status
    var _mousedown = false;

    var _event_start;
    var _event_move;
    var _event_end;

    var _has_touch = ('ontouchstart' in window);


    /**
     * option setter/getter
     * @param   string  key
     * @param   mixed   value
     * @return  mixed   value
     */
    this.option = function(key, val) {
        if(val != undefined) {
            options[key] = val;
        }

        return options[key];
    };


    /**
     * angle to direction define
     * @param  float    angle
     * @return string   direction
     */
    this.getDirectionFromAngle = function( angle )
    {
        var directions = {
            down: angle >= 45 && angle < 135, //90
            left: angle >= 135 || angle <= -135, //180
            up: angle < -45 && angle > -135, //270
            right: angle >= -45 && angle <= 45 //0
        };

        var direction, key;
        for(key in directions){
            if(directions[key]){
                direction = key;
                break;
            }
        }
        return direction;
    };


    /**
     * count the number of fingers in the event
     * when no fingers are detected, one finger is returned (mouse pointer)
     * @param  event
     * @return int  fingers
     */
    function countFingers( event )
    {
        // there is a bug on android (until v4?) that touches is always 1,
        // so no multitouch is supported, e.g. no, zoom and rotation...
        return event.touches ? event.touches.length : 1;
    }


    /**
     * get the x and y positions from the event object
     * @param  event
     * @return array  [{ x: int, y: int }]
     */
    function getXYfromEvent( event )
    {
        event = event || window.event;

        // no touches, use the event pageX and pageY
        if(!_has_touch) {
            var doc = document,
                body = doc.body;

            return [{
                x: event.pageX || event.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && doc.clientLeft || 0 ),
                y: event.pageY || event.clientY + ( doc && doc.scrollTop || body && body.scrollTop || 0 ) - ( doc && doc.clientTop || body && doc.clientTop || 0 )
            }];
        }
        // multitouch, return array with positions
        else {
            var pos = [], src, touches = event.touches.length > 0 ? event.touches : event.changedTouches;
            for(var t=0, len=touches.length; t<len; t++) {
                src = touches[t];
                pos.push({ x: src.pageX, y: src.pageY });
            }
            return pos;
        }
    }


    /**
     * calculate the angle between two points
     * @param   object  pos1 { x: int, y: int }
     * @param   object  pos2 { x: int, y: int }
     */
    function getAngle( pos1, pos2 )
    {
        return Math.atan2(pos2.y - pos1.y, pos2.x - pos1.x) * 180 / Math.PI;
    }


    /**
     * calculate the scale size between two fingers
     * @param   object  pos_start
     * @param   object  pos_move
     * @return  float   scale
     */
    function calculateScale(pos_start, pos_move)
    {
        if(pos_start.length == 2 && pos_move.length == 2) {
            var x, y;

            x = pos_start[0].x - pos_start[1].x;
            y = pos_start[0].y - pos_start[1].y;
            var start_distance = Math.sqrt((x*x) + (y*y));

            x = pos_move[0].x - pos_move[1].x;
            y = pos_move[0].y - pos_move[1].y;
            var end_distance = Math.sqrt((x*x) + (y*y));

            return end_distance / start_distance;
        }

        return 0;
    }


    /**
     * calculate the rotation degrees between two fingers
     * @param   object  pos_start
     * @param   object  pos_move
     * @return  float   rotation
     */
    function calculateRotation(pos_start, pos_move)
    {
        if(pos_start.length == 2 && pos_move.length == 2) {
            var x, y;

            x = pos_start[0].x - pos_start[1].x;
            y = pos_start[0].y - pos_start[1].y;
            var start_rotation = Math.atan2(y, x) * 180 / Math.PI;

            x = pos_move[0].x - pos_move[1].x;
            y = pos_move[0].y - pos_move[1].y;
            var end_rotation = Math.atan2(y, x) * 180 / Math.PI;

            return end_rotation - start_rotation;
        }

        return 0;
    }


    /**
     * trigger an event/callback by name with params
     * @param string name
     * @param array  params
     */
    function triggerEvent( eventName, params )
    {
        // return touches object
        params.touches = getXYfromEvent(params.originalEvent);
        params.type = eventName;

        // trigger callback
        if(isFunction(self["on"+ eventName])) {
            self["on"+ eventName].call(self, params);
        }
    }


    /**
     * cancel event
     * @param   object  event
     * @return  void
     */

    function cancelEvent(event)
    {
        if (!options.cancel_event) { return; };

        event = event || window.event;
        if(event.preventDefault){
            event.preventDefault();
            event.stopPropagation();
        }else{
            event.returnValue = false;
            event.cancelBubble = true;
        }
    }


    /**
     * reset the internal vars to the start values
     */
    function reset()
    {
        _pos = {};
        _first = false;
        _fingers = 0;
        _distance = 0;
        _angle = 0;
        _gesture = null;
    }


    var gestures = {
        // hold gesture
        // fired on touchstart
        hold : function(event)
        {
            // only when one finger is on the screen
            if(options.hold) {
                _gesture = 'hold';
                clearTimeout(_hold_timer);

                _hold_timer = setTimeout(function() {
                    if(_gesture == 'hold') {
                        triggerEvent("hold", {
                            originalEvent   : event,
                            position        : _pos.start
                        });
                    }
                }, options.hold_timeout);
            }
        },

        // swipe gesture
        // fired on touchend
        swipe : function(event)
        {
            if(!_pos.move) {
                return;
            }

            // get the distance we moved
            var _distance_x = _pos.move[0].x - _pos.start[0].x;
            var _distance_y = _pos.move[0].y - _pos.start[0].y;
            _distance = Math.sqrt(_distance_x*_distance_x + _distance_y*_distance_y);

            // compare the kind of gesture by time
            var now = new Date().getTime();
            var touch_time = now - _touch_start_time;

            if(options.swipe && (options.swipe_time > touch_time) && (_distance > options.swipe_min_distance)) {
                // calculate the angle
                _angle = getAngle(_pos.start[0], _pos.move[0]);
                _direction = self.getDirectionFromAngle(_angle);

                _gesture = 'swipe';

                var position = { x: _pos.move[0].x - _offset.left,
                    y: _pos.move[0].y - _offset.top };

                var event_obj = {
                    originalEvent   : event,
                    position        : position,
                    direction       : _direction,
                    distance        : _distance,
                    distanceX       : _distance_x,
                    distanceY       : _distance_y,
                    angle           : _angle
                };

                // normal slide event
                triggerEvent("swipe", event_obj);
            }
        },


        // drag gesture
        // fired on mousemove
        drag : function(event)
        {
            // get the distance we moved
            var _distance_x = _pos.move[0].x - _pos.start[0].x;
            var _distance_y = _pos.move[0].y - _pos.start[0].y;
            _distance = Math.sqrt(_distance_x * _distance_x + _distance_y * _distance_y);

            // drag
            // minimal movement required
            if(options.drag && (_distance > options.drag_min_distance) || _gesture == 'drag') {
                // calculate the angle
                _angle = getAngle(_pos.start[0], _pos.move[0]);
                _direction = self.getDirectionFromAngle(_angle);

                // check the movement and stop if we go in the wrong direction
                var is_vertical = (_direction == 'up' || _direction == 'down');
                if(((is_vertical && !options.drag_vertical) || (!is_vertical && !options.drag_horizontal))
                    && (_distance > options.drag_min_distance)) {
                    return;
                }

                var interim_angle = getAngle(_pos.interim || _pos.start[0], _pos.move[0]),
                    interim_direction = self.getDirectionFromAngle(interim_angle);
                _pos.interim = _pos.move[0];


                _gesture = 'drag';

                var position = { x: _pos.move[0].x - _offset.left,
                    y: _pos.move[0].y - _offset.top };

                var event_obj = {
                    originalEvent   : event,
                    position        : position,
                    direction       : _direction,
                    distance        : _distance,
                    distanceX       : _distance_x,
                    distanceY       : _distance_y,
                    angle           : _angle,
                    interim_angle: interim_angle,
                    interim_direction: interim_direction
                };

                // on the first time trigger the start event
                if(_first) {
                    triggerEvent("dragstart", event_obj);

                    _first = false;
                }

                // normal slide event
                triggerEvent("drag", event_obj);

                cancelEvent(event);
            }
        },


        // transform gesture
        // fired on touchmove
        transform : function(event)
        {
            if(options.transform) {
                if(countFingers(event) != 2) {
                    return false;
                }

                var rotation = calculateRotation(_pos.start, _pos.move);
                var scale = calculateScale(_pos.start, _pos.move);

                if(_gesture != 'drag' &&
                    (_gesture == 'transform' || Math.abs(1-scale) > options.scale_treshold || Math.abs(rotation) > options.rotation_treshold)) {
                    _gesture = 'transform';

                    _pos.center = {  x: ((_pos.move[0].x + _pos.move[1].x) / 2) - _offset.left,
                        y: ((_pos.move[0].y + _pos.move[1].y) / 2) - _offset.top };

                    var event_obj = {
                        originalEvent   : event,
                        position        : _pos.center,
                        scale           : scale,
                        rotation        : rotation
                    };

                    // on the first time trigger the start event
                    if(_first) {
                        triggerEvent("transformstart", event_obj);
                        _first = false;
                    }

                    triggerEvent("transform", event_obj);

                    cancelEvent(event);

                    return true;
                }
            }

            return false;
        },


        // tap and double tap gesture
        // fired on touchend
        tap : function(event)
        {
            // compare the kind of gesture by time
            var now = new Date().getTime();
            var touch_time = now - _touch_start_time;

            // dont fire when hold is fired
            if(options.hold && !(options.hold && options.hold_timeout > touch_time)) {
                return;
            }

            // when previous event was tap and the tap was max_interval ms ago
            var is_double_tap = (function(){
                if (_prev_tap_pos &&
                    options.tap_double &&
                    _prev_gesture == 'tap' &&
                    (_touch_start_time - _prev_tap_end_time) < options.tap_max_interval)
                {
                    var x_distance = Math.abs(_prev_tap_pos[0].x - _pos.start[0].x);
                    var y_distance = Math.abs(_prev_tap_pos[0].y - _pos.start[0].y);
                    return (_prev_tap_pos && _pos.start && Math.max(x_distance, y_distance) < options.tap_double_distance);
                }
                return false;
            })();

            if(is_double_tap) {
                _gesture = 'double_tap';
                _prev_tap_end_time = null;

                triggerEvent("doubletap", {
                    originalEvent   : event,
                    position        : _pos.start
                });
                cancelEvent(event);
            }

            // single tap is single touch
            else {
                var x_distance = (_pos.move) ? Math.abs(_pos.move[0].x - _pos.start[0].x) : 0;
                var y_distance =  (_pos.move) ? Math.abs(_pos.move[0].y - _pos.start[0].y) : 0;
                _distance = Math.max(x_distance, y_distance);

                if(_distance < options.tap_max_distance) {
                    _gesture = 'tap';
                    _prev_tap_end_time = now;
                    _prev_tap_pos = _pos.start;

                    if(options.tap) {
                        triggerEvent("tap", {
                            originalEvent   : event,
                            position        : _pos.start
                        });
                        cancelEvent(event);
                    }
                }
            }

        }

    };


    function handleEvents(event)
    {
        switch(event.type)
        {
            case 'mousedown':
            case 'touchstart':
                _pos.start = getXYfromEvent(event);
                _touch_start_time = new Date().getTime();
                _fingers = countFingers(event);
                _first = true;
                _event_start = event;

                // borrowed from jquery offset https://github.com/jquery/jquery/blob/master/src/offset.js
                var box = element.getBoundingClientRect();
                var clientTop  = element.clientTop  || document.body.clientTop  || 0;
                var clientLeft = element.clientLeft || document.body.clientLeft || 0;
                var scrollTop  = window.pageYOffset || element.scrollTop  || document.body.scrollTop;
                var scrollLeft = window.pageXOffset || element.scrollLeft || document.body.scrollLeft;

                _offset = {
                    top: box.top + scrollTop - clientTop,
                    left: box.left + scrollLeft - clientLeft
                };

                _mousedown = true;

                // hold gesture
                gestures.hold(event);

                if(options.prevent_default) {
                    cancelEvent(event);
                }
                break;

            case 'mousemove':
            case 'touchmove':
                if(!_mousedown) {
                    return false;
                }
                _event_move = event;
                _pos.move = getXYfromEvent(event);

                if(!gestures.transform(event)) {
                    gestures.drag(event);
                }
                break;

            case 'mouseup':
            case 'mouseout':
            case 'touchcancel':
            case 'touchend':
                if(!_mousedown || (_gesture != 'transform' && event.touches && event.touches.length > 0)) {
                    return false;
                }

                _mousedown = false;
                _event_end = event;
                
                var dragging = _gesture == 'drag';

                // swipe gesture
                gestures.swipe(event);


                // drag gesture
                // dragstart is triggered, so dragend is possible
                if(dragging) {
                    triggerEvent("dragend", {
                        originalEvent   : event,
                        direction       : _direction,
                        distance        : _distance,
                        angle           : _angle
                    });
                }

                // transform
                // transformstart is triggered, so transformed is possible
                else if(_gesture == 'transform') {
                    triggerEvent("transformend", {
                        originalEvent   : event,
                        position        : _pos.center,
                        scale           : calculateScale(_pos.start, _pos.move),
                        rotation        : calculateRotation(_pos.start, _pos.move)
                    });
                }
                else {
                    gestures.tap(_event_start);
                }

                _prev_gesture = _gesture;

                // trigger release event
                triggerEvent("release", {
                    originalEvent   : event,
                    gesture         : _gesture
                });

                // reset vars
                reset();
                break;
        }
    }


    // bind events for touch devices
    // except for windows phone 7.5, it doesnt support touch events..!
    if(_has_touch) {
        addEvent(element, "touchstart touchmove touchend touchcancel", handleEvents);
    }
    // for non-touch
    else {
        addEvent(element, "mouseup mousedown mousemove", handleEvents);
        addEvent(element, "mouseout", function(event) {
            if(!isInsideHammer(element, event.relatedTarget)) {
                handleEvents(event);
            }
        });
    }


    /**
     * find if element is (inside) given parent element
     * @param   object  element
     * @param   object  parent
     * @return  bool    inside
     */
    function isInsideHammer(parent, child) {
        // get related target for IE
        if(!child && window.event && window.event.toElement){
            child = window.event.toElement;
        }

        if(parent === child){
            return true;
        }

        // loop over parentNodes of child until we find hammer element
        if(child){
            var node = child.parentNode;
            while(node !== null){
                if(node === parent){
                    return true;
                };
                node = node.parentNode;
            }
        }
        return false;
    }


    /**
     * merge 2 objects into a new object
     * @param   object  obj1
     * @param   object  obj2
     * @return  object  merged object
     */
    function mergeObject(obj1, obj2) {
        var output = {};

        if(!obj2) {
            return obj1;
        }

        for (var prop in obj1) {
            if (prop in obj2) {
                output[prop] = obj2[prop];
            } else {
                output[prop] = obj1[prop];
            }
        }
        return output;
    }


    /**
     * check if object is a function
     * @param   object  obj
     * @return  bool    is function
     */
    function isFunction( obj ){
        return Object.prototype.toString.call( obj ) == "[object Function]";
    }


    /**
     * attach event
     * @param   node    element
     * @param   string  types
     * @param   object  callback
     */
    function addEvent(element, types, callback) {
        types = types.split(" ");
        for(var t= 0,len=types.length; t<len; t++) {
            if(element.addEventListener){
                element.addEventListener(types[t], callback, false);
            }
            else if(document.attachEvent){
                element.attachEvent("on"+ types[t], callback);
            }
        }
    }
}


/*

 UTILITY DOM function (since we don't have jquery)

*/
function Q(elements, fn) {
    
    // select elements
    if (elements === undefined || elements === '') elements = [];
    else if (typeof elements === 'string') {
        elements = document.querySelectorAll(elements);
    } else if (Object.prototype.toString.call(elements) !== '[object Array]') elements = [elements];

    // return enhanced object
    return {
        each: function(fn) {
            for (var i = 0; i < elements.length; i++) {
                fn.call(elements[i], elements[i]);
            }
            return this;
        },

        find: function(selector) {
            var els = [];
            this.each(function(el) {
                var subels = el.querySelectorAll(selector);
                for (var i = 0; i < subels.length; i++) {
                    els.push(subels[i]);
                }
            });
            return Q(els);
        },

        has: function(selector) {
            for (var i = 0; i < elements.length; i++) {
                if (elements[i].querySelectorAll(selector).length > 0)
                    return true
            }
            return false
        },

        nodes: function() { 
            return elements; 
        },

        get: function(index) {
            var idx = index || 0;
            return elements[idx];
        },
        
        on: function(events, callback) {
            var _this = this;
            var _events = events.split(/\s*,\s*/);
            
            return _this.each(function(el) {
                for (var evt = _events[0], i = 0; i < _events.length; evt = _events[++i]) {
                    if (evt == 'tap' || evt == 'hold') {
                        // special touch event
                        new Hammer(el, {drag: false, swipe: false, transform: false})['on' + evt] = function() {
                            callback.apply(el, arguments);
                        };
                    } else {
                        // normal events
                        if (window.addEventListener) {
                            el.addEventListener(evt, callback, false);
                        } else {
                            el.attachEvent('on' + evt, callback); // IE
                        }
                    }
                }
            });
        },
        
        addClass: function(name) {
            return this.each(function(el){
                el.className += ' ' + name;
            });
        },
        
        removeClass: function(name) {
            return this.each(function(el){
                el.className = (' ' + el.className + ' ').replace(new RegExp("\\s+("+name+"\\s+)+","g"), ' ').replace(/^\s+/,'').replace(/\s+$/,'');
            });
        },
        
        hasClass: function(name) {
            // returns true if last element hasClass
            var has = false;
            this.each(function(el){
                has = new RegExp("\\s+"+name+"\\s+").test(' ' + el.className + ' ');
            });
            return has;
        },

        toggleClass: function(name) {
            var el = this;
            return this.each(function(){
                if (el.hasClass(name)) el.removeClass(name);
                else el.addClass(name);
            });
        },

        show: function() {
            return this.each(function(el) {
                el.style.display = '';
            });
        },

        hide: function() {
            return this.each(function(el) {
                el.style.display = 'none';
            });
        },

        text: function(text) {
            return this.each(function(el) {
                el.textContent = text;
            });
        }
    };
}
// helper creator
function C(tagName, options) {
    var el = document.createElement(tagName);
    
    if (options.innerHTML) el.innerHTML = options.innerHTML;
    else if (options.innerText) el.textContent = options.innerText;
    
    for (option in options) {
        el.setAttribute(option, options[option]);
    }
    
    return el;
}
function getURLParameter(name) {
    var params = location.search.replace(/\/$/, '');
    var value = decodeURI((RegExp(name + '=' + '(.+?)(&|$)').exec(params)||[,null])[1]);

    return value === 'null'? undefined : value;
}


// sync via WebSockets
var WS = (function(doc, win){
    var supported = !!win.WebSocket;
    var webSocket;

    var connected = false;
    var isOwner   = false;

    var lastMessageReceivedAt;
    var retries = 0;

    // detect WebSockets
    if (!supported) {
        Q(doc.documentElement).addClass('no-websocket')
    }

    // set connection status
    function setStatus(status) {
        Q(doc.documentElement)
            .removeClass('sync-offline')
            .removeClass('sync-online')
            .addClass('sync-' + status);

        connected = (status === 'online');
    }
    setStatus('offline');

    // select first slide to show
    var firstSlide = location.hash.replace('#slide-','');
    if (getURLParameter('mode') === 'audience') // audience can't have first slide
        firstSlide = '';

    // function reconnect
    var _url = undefined;
    var _secret = undefined;
    var _room = undefined;
    function tryToReconnect() {
        // TODO extract max_retries
        if (retries > 20) {
            // TODO extract message
            alert('Conexão perdida. Tente atualizar a página.');
            clearInterval(timer);
            return;
        }

        if (!connected && _url !== undefined) {
            WS.connect(_url, _room, _secret);
        }
    }


    // check connection status every 10s
    if (supported) {
        var timer = setInterval(function(){
            // if last message was 60s ago,
            // close connection.
            if (lastMessageReceivedAt < new Date().getTime() - 40000) {
                WS.close();
            }

            // if offline, try to reconnect
            if (!connected) tryToReconnect();
        }, 10000);
    }

    // closes connection on page refresh
    window.onbeforeunload = function() {
        WS.close();
    };
    
    // public API
    return {
        connect: function(url, room, secret) {
            // cache values
            _url = url;
            _room = room;
            _secret = secret;

            if (!supported) return;

            // validate params
            if (room === undefined || room === 'null' || room === 'undefined') room = '';
            if (secret === undefined || secret === 'null' || secret === 'undefined') secret = '';

            url += '?room=' + room + '&secret=' + secret;

            // open connection
            try {

                // free previous connection attempt
                try {
                    if (webSocket) webSocket.close();
                } catch(e) {}

                // try to connect
                retries++;
                webSocket = new WebSocket(url);

                webSocket.onopen = function(event) {
                    // introducing myself
                    webSocket.send(': ' + navigator.userAgent);
                
                    // change status to online
                    setStatus('online');

                    // syncing first slide
                    if (firstSlide !== '')
                        webSocket.send('# ' + firstSlide);

                    // clear retry counter
                    retries = 0;
                };

                webSocket.onmessage = function(event) {
                    var message = event.data;
                    lastMessageReceivedAt = new Date().getTime();

                    // new slide message
                    if (message.indexOf('# ') === 0) {
                        P.showSlide(message.substr(2));
                    }

                    // total clients message
                    else if(message.indexOf('+ ') === 0) {
                        Q('.sync-clients').text(message.substr(2));
                    }

                    // handshake, approving this client
                    else if (message === '$ ' + secret) {
                        isOwner = true;

                        // if owner, send current slide
                        WS.sendSlide(P.activeSlide().id);
                    }

                    // client room 
                    else if (message.indexOf('= ') === 0) {
                        _room = message.substr(2);
                        if (console) console.log('Connected to room ' + _room);

                        // notify room callbacks
                        var evt = document.createEvent('Event');
                        evt.initEvent('roomconnect', true, true);
                        document.dispatchEvent(evt);
                    }
                };

                webSocket.onerror = function(error) {
                    // TODO should we really disconnect here?
                    WS.close();

                    console.log(error);
                };

                webSocket.onclose = function(event) {
                    setStatus('offline');
                };

            } catch(e) {
                if (window.console) {
                    console.log('Error:')
                    console.log(e);
                }
                setStatus('offline');
            }
        },

        sendSlide: function(id) {
            if (!supported || !connected) return;

            // setTimeout prevent bug on iOS
            // (according to socket-io)
            setTimeout(function(){
                webSocket.send('# ' + id);    
            }, 0);
        },

        close: function() {
            connected = false;
            if (!supported) return;
            try {
               if (webSocket) webSocket.close();
            } catch(e) {}
            webSocket = undefined;
            setStatus('offline');
        },

        isSupported: function() {
            return supported
        },

        isConnected: function() {
            return connected
        },

        isOwner: function() {
            return isOwner;
        },

        myRoom: function(){
            return _room;
        }
    };

})(document, window);


(function(){
    // initial room
    var room = document.documentElement.getAttribute('data-room') || getURLParameter('room');

    // set room class
    document.documentElement.className += (room === 'main-room')? ' main-room' : ' normal-room';

    // connect sync

    // live presentation sync disabled in the static archive

})();




/**

PRESENTATION LOGIC

- TODO presenter mode
    * só anotacoes
    * contador de tempo
    * proximo slide
    * navegacao via teclado e touch
- TODO controller mode
    * mobile, touch mode
    * botoes de avancar e voltar
    * navegacao via botoes ou swipe


**/

var P = (function(doc, userAgent, location, win){

    // caches recurrent elements
    // TODO make the selector configurable
    var presentationContainer = Q('.presentation');
    var slides = presentationContainer.find('.slide');



    // possible display modes.
    // initial mode is the page query string or 'site'.
    var possibleModes = ['site', 'presentation', 'audience' /*, 'presenter', 'remote' */];
    var mode = '';



    // different modes entering 
    // and exit logic
    var modes = {
        presentation: {
            enter: function() {
                // enter full screen using HTML5 API
                presentationContainer.addClass('entering-presentation');
                var fullscreen = doc.body.requestFullScreen || doc.body.webkitRequestFullScreen  || doc.body.mozRequestFullScreen;
                if (fullscreen) fullscreen.call(doc.body);
            },

            exit: function() {
                // clear slide full screen size
                presentationContainer.get().style.width = '';
            }
        },

        site: {
            enter: function() {
            },
            exit: function() {
            }
        },

        audience: {
            enter: function() {
            },
            exit: function() {
            }
        }   
    };


    // buttons to change modes
    Q('.enter-mode').on("tap", function() {
        P.enter(this.getAttribute('data-mode'));
    });


    // button to toggle slide view on audience mode
    Q('.slide-toggle').on('tap', function() {
        Q(doc.documentElement).toggleClass('hide-slide');

        // notify slide resizer to do its magic
        var evt = document.createEvent('Event');
        evt.initEvent('slidescale', true, true);
        document.dispatchEvent(evt);
    });

    // buttons to navigate
    Q('.goto-previous').on('tap', function(){
        P.showPreviousSlide();
    })
    Q('.goto-next').on('tap', function(){
        P.showNextSlide();
    })

    // touch to enter presentation mode on mobile
    Q('.goto-presentation-mode').on('hold', function(){
        P.enter('presentation');
    })

    // buttons to do manual sync
    Q('.do-sync').on("tap", function() {
        if (!Q(doc.documentElement).hasClass('doing-manual-sync')) {
            loadLastSlideViaAjax();
            Q(doc.documentElement).addClass('doing-manual-sync');
        }
    });


    // fullscreen event to trigger presentation mode in and out
    Q(doc).on('mozfullscreenchange, webkitfullscreenchange, fullscreenchange', function(){
        if (mode == 'presentation') {
            if (presentationContainer.hasClass('entering-presentation')) {
                presentationContainer.removeClass('entering-presentation')
            } else {
                P.enter('site');    
            }
        }
        else {
            P.enter('presentation');
        }
    });


    // navigating slides via keyboard
    Q(win).on('keydown', function(event){

        // audience mode can't change slides
        if (mode === 'audience') return;
        
        // treat event and charcode
        if (!event) event = window.event;
        var code = event.keyCode;
        if (event.charCode && code == 0)
            code = event.charCode;

        // treat keys
        switch(code) {

            // navigate to previous slide:
            case 37: // left arrow
            case 38: // Key up.
                P.showPreviousSlide();
                event.preventDefault();
                break;

            // navigate to next slide:
            case 39: // Key right.
            case 40: // Key down.
            case 32: // space
            case 13: // enter
                P.showNextSlide();
                event.preventDefault();
                break;

            // exit presentation and back to site mode:
            case 27: // ESC
                P.enter('site');
                event.preventDefault();
                break;

            // enter presentation mode:
            case 80: // 'p' key
                P.enter('presentation');
                event.preventDefault();
                break;

            // force slide sync
            case 83: // 's' key
                var secret = prompt('Type your secret and refresh');
                localStorage.setItem('sync-secret', secret);
                break;

            // jump to slide
            case 71: // 'g' key
                var id = prompt('Slide id or index');
                if (!isNaN(id)) id = slides.get(parseInt(id)).id;

                P.showSlide(id);
                WS.sendSlide(id);
                break;

            // jump to first slide
            case 72: // 'h' key
                P.showSlide(slides.get().id);
                WS.sendSlide(slides.get().id);
                break
        }


    });

    
    // slide changes callbacks
    var slideCallbacks = {
        before: [],
        after:  [],
        firstTime: []
    };


    // slide activation.
    var activeSlide;


    // svg presentation
    var svgPresentation = Q('.svg-data svg').get(0);

    if (svgPresentation) {
        svgPresentation.removeAttribute('width');
        svgPresentation.removeAttribute('height');
        svgPresentation.setAttribute('viewBox', '0 0 800 600');

        // create svg:group
        // var svgContainer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        // Q('.svg-data svg > *').each(function(el){
        //     if (el.tagName.indexOf('inkscape') >= 0 || el.tagName.indexOf('sodipodi') >= 0 || el.tagName == 'defs' || el.tagName == 'metadata') 
        //         return;

        //     svgContainer.appendChild(el);
        // });
        // svgPresentation.appendChild(svgContainer);
    }

    // exported public API
    return {

        // make  enter the specified display mode
        enter: function(newMode) {
            if (possibleModes.indexOf(newMode) == -1) {
                throw "There is no " + newMode + " mode available.";
            }

            // add a specific class to HTML root like 'presentation-mode' or 'site-mode'
            Q(doc.documentElement).removeClass(mode + '-mode').addClass(newMode + '-mode');
            
            // call mode entering logic
            if (modes[mode] !== undefined) {
                modes[mode]['exit'].call(P);
            }

            mode = newMode;

            if (modes[newMode] !== undefined) {
                modes[newMode]['enter'].call(P);
            }

            // notify mode change event
            var evt = document.createEvent('Event');
            evt.initEvent('slidescale', true, true);
            document.dispatchEvent(evt);
        },

        showSlide: function(name) {
            var slide = Q('#' + name).get();
            if (!slide) return;

            var oldID = activeSlide.id;

            // old slide after callback
            if (slideCallbacks.after[oldID] !== undefined) {
                slideCallbacks.after[oldID].call(P, doc.getElementById(oldID), slideCallbacks.firstTime[oldID]);
                //slideCallbacks.firstTime[oldID] = false;
            }

            // new slide before callback
            if (slideCallbacks.before[name] !== undefined) {
                slideCallbacks.before[name].call(P, slide, slideCallbacks.firstTime[name]);
                slideCallbacks.firstTime[name] = false;
            }

            // changes URL
            location.hash = 'slide-' + name;

            // show slide
            Q(activeSlide).removeClass('active');
            Q(slide).addClass('active');
            activeSlide = slide;

            // show SVG image
            if (svgPresentation) {
                var slideNumber = slides.nodes().indexOf(slide);
                var currentSvgPosition = slideNumber * 1000;
                
                //svgContainer.setAttributeNS(null, 'transform', 'translate(-' + currentSvgPosition + ')');
                svgPresentation.setAttribute('viewBox', currentSvgPosition + ' 0 800 600');
            }

            // audience mode:
            // show last .audience if needed
            slides.removeClass('audience-active');
            var audience = slide.getAttribute('data-audience');
            Q('#' + audience).addClass('audience-active');

            // notify slide change event
            var evt = document.createEvent('Event');
            evt.initEvent('showslide', true, true);
            evt.slideName = name;
            document.dispatchEvent(evt);
        },

        showNextSlide: function() {
            // find next slide
            var actual = activeSlide;
            var next;
            do {
                if (activeSlide) {
                    next = actual.getAttribute('data-next');
                } else {
                    next = slides.get(0).id; // first slide
                }
                actual = document.getElementById(next);
            } while (next && Q('#'+next).hasClass('skip-on-' + mode));
            
            if (next) { 
                // show next slide and broadcast change
                WS.sendSlide(next);
                this.showSlide(next); 
            }
        },

        showPreviousSlide: function() {
            if (activeSlide) {
                // select previous slide
                var actual = activeSlide;
                var previous;

                do {
                    previous = actual.getAttribute('data-previous');
                    actual = document.getElementById(previous);
                } while (previous && Q('#'+previous).hasClass('skip-on-' + mode));
                
                if (previous) {
                    // show slide and broadcast change
                    WS.sendSlide(previous);
                    this.showSlide(previous);
                }
            }
        },

        activeSlide: function(){
            return activeSlide;
        },

        mode: function() {
            return mode;
        },

        before: function(slide, callback) {
            slideCallbacks.before[slide] = callback;
            slideCallbacks.firstTime[slide] = true;
        },

        after: function(slide, callback) {
            slideCallbacks.after[slide] = callback;
            slideCallbacks.firstTime[slide] = true;
        },

        on: function(slides, callbacks) {
            var _slides = slides.split(/\s*,\s*/);
            
            for (var slide = _slides[0], i = 0; i < _slides.length; slide = _slides[++i]) {
                if (callbacks.before) P.before(slide, callbacks.before);
                if (callbacks.after)  P.after(slide, callbacks.after);
            }
        },

        init: function(options) {
            var i = 0;

            // deal with config options
            possibleModes = options.possibleModes || possibleModes;

            // caches next and previous slide information
            // using data attributes on each slide
            if (slides.nodes().length > 1) {
                var previous = undefined;
                var lastAudience = undefined;

                slides.each(function(el) {
                    // if doesn't have an id, generate one
                    if (!el.id) {
                        el.id = 'n' + (i++);
                    }

                    // set audience id
                    if (Q(el).has('.audience')) {
                        lastAudience = el.id;
                    }
                    el.setAttribute('data-audience', lastAudience);

                    // set previous and next
                    if (previous) {
                        el.setAttribute('data-previous', previous.id);
                        previous.setAttribute('data-next', el.id);
                    }
                    previous = el;
                });
            }

            // show first slide
            // initially, first slide or URL #hash
            activeSlide = doc.getElementById(location.hash.replace('#slide-','')) || slides.get(0);
            this.showSlide(activeSlide.id);

            // enter the first, initial mode
            var initialMode = getURLParameter('mode') || document.documentElement.getAttribute('data-initial-mode') || 'site';
            if (possibleModes.indexOf(initialMode) == -1) initialMode = possibleModes[0];
            this.enter(initialMode);


            // config params
            options.slideViewport = options.slideViewport || [1024, 768]
            var slideWidth = options.slideViewport[0];
            var slideHeight = options.slideViewport[1];


            // presentation slide resizer.
            // keeps the slide always on the same ratio to preserve design
            (function() {
                // create style
                var style = C('style', {});
                style.appendChild(document.createTextNode(""));
                doc.head.appendChild(style);                

                Q(window).on('resize, orientationchange, slidescale', function(){

                    // scale presentation container
                    if (mode == 'presentation') {
                        if (doc.documentElement.offsetWidth / slideWidth < doc.documentElement.offsetHeight / slideHeight) {
                            var presentationWidth = (doc.documentElement.offsetWidth / slideWidth);
                        } else {
                            var presentationWidth = (doc.documentElement.offsetHeight / slideHeight);
                        }
                        presentationWidth = slideWidth * presentationWidth + 'px';
                        presentationContainer.get().style.width = presentationWidth;
                    }
                    
                    // scale slide content
                    var slideContainer = activeSlide || slides.get(0);
                    if (mode === 'presentation') {
                        // if presentation, scales to fit 100% screen size.
                        // don't allow overflow on any size, so we resize according to the smallest orientation.
                        var scaleFactor = Math.min(slideContainer.offsetWidth / slideWidth, slideContainer.offsetHeight / slideHeight);
                    } else {
                        // all other modes should scale according to the screen width.
                        // these modes aren't fullscreen so we can scroll to view more if needed.
                        var scaleFactor = slideContainer.offsetWidth / slideWidth;
                    }

                    // we need to calculate the top negative offset needed to position the scaled slide on top.
                    var topOffset = (-slideHeight * (1 - scaleFactor)) + "px";

                    // apply dynamic CSS properties
                    var css = 
                    ".slide .content, .svg-data { " +
                        "top: " + topOffset + ";" +
                        "-webkit-transform: scale(" + scaleFactor + ");" +
                           "-moz-transform: scale(" + scaleFactor + ");" +
                            "-ms-transform: scale(" + scaleFactor + ");" +
                             "-o-transform: scale(" + scaleFactor + ");" +
                                "transform: scale(" + scaleFactor + ");" +
                    "}";

                    if(style.styleSheet){
                        style.styleSheet.cssText = css;
                    }else{
                        style.removeChild(style.firstChild);
                        style.appendChild(document.createTextNode(css));
                    }


                    // change base font-size for presentation bar so it scales nicelly with the slide.
                    // so, use only 'em's on .bars
                    Q('.bars .content').get().style.fontSize = (slideContainer.offsetWidth / slideWidth * 100) + '%';

                    return arguments.callee;
                }());


            })();
        }
    };

})(document, navigator.userAgent, location, window);


// offline: supports update
(function(window){

    function updateAvailable() {
        // TODO extrair mensagem
        if (confirm('Uma atualização está disponível. Recarregar a página?')) {
            window.location.reload();
        }
    }

    if ('applicationCache' in window) {
        window.applicationCache.addEventListener('updateready', updateAvailable);
        if(window.applicationCache.status === window.applicationCache.UPDATEREADY) {
          updateAvailable();
        }
    }

})(window);



/* analytics removed during archive migration */

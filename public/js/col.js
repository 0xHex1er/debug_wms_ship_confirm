(function($) {
    "use strict";

    var Collapse = function(element, options) {
        this.$element = $(element);
        this.options = $.extend({}, Collapse.DEFAULTS, options);
        this.$trigger = $('[data-toggle="collapse"][href="#' + element.id + '"],' +
                          '[data-toggle="collapse"][data-target="#' + element.id + '"]');
        this.transitioning = null;

        if (this.options.parent) {
            this.$parent = this.getParent();
        } else {
            this.addAriaAndCollapsedClass(this.$element, this.$trigger);
        }

        if (this.options.toggle) this.toggle();
    };

    Collapse.VERSION = "3.4.1";
    Collapse.TRANSITION_DURATION = 350;
    Collapse.DEFAULTS = {
        toggle: true
    };

    Collapse.prototype.dimension = function() {
        return this.$element.hasClass("width") ? "width" : "height";
    };

    Collapse.prototype.show = function() {
        if (this.transitioning || this.$element.hasClass("in")) return;
    
        var dimension = this.dimension();
        this.$element.removeClass("collapse").addClass("collapsing").attr("aria-expanded", true);
        this.$trigger.removeClass("collapsed").attr("aria-expanded", true);
        
        this.transitioning = 1;
    
        var complete = function() {
            this.$element.removeClass("collapsing").addClass("collapse in");
            this.transitioning = 0;
            this.$element.trigger("shown.bs.collapse");
        }.bind(this);
    
        if (!$.support.transition) return complete();
    
        var scrollSize = $.camelCase(["scroll", dimension].join("-"));
        this.$element.one("bsTransitionEnd", complete).emulateTransitionEnd(Collapse.TRANSITION_DURATION)[dimension](this.$element[0][scrollSize]);
    };
    
    

    Collapse.prototype.hide = function() {
        if (this.transitioning || !this.$element.hasClass("in")) return;
    
        var dimension = this.dimension();
        this.$element[dimension](this.$element[dimension]())[0].offsetHeight;
        this.$element.addClass("collapsing").removeClass("collapse in").attr("aria-expanded", false); 
        this.$trigger.addClass("collapsed").attr("aria-expanded", false);
        
        this.transitioning = 1;
    
        var complete = function() {
            this.transitioning = 0;
            this.$element.removeClass("collapsing").addClass("collapse").trigger("hidden.bs.collapse");
        }.bind(this);
    
        if (!$.support.transition) return complete();
    
        this.$element.one("bsTransitionEnd", complete).emulateTransitionEnd(Collapse.TRANSITION_DURATION);
    };
    
    

    Collapse.prototype.toggle = function() {
        this[this.$element.hasClass("in") ? "hide" : "show"]();
    };

    Collapse.prototype.getParent = function() {
        return $(document).find(this.options.parent).find('[data-toggle="collapse"][data-parent="' + this.options.parent + '"]').each(function(i, el) {
            var $el = $(el);
            this.addAriaAndCollapsedClass(getTarget($el), $el);
        }.bind(this)).end();
    };

    Collapse.prototype.addAriaAndCollapsedClass = function($element, $trigger) {
        var isOpen = $element.hasClass("in");
        $element.attr("aria-expanded", isOpen);
        $trigger.toggleClass("collapsed", !isOpen).attr("aria-expanded", isOpen);
    };

    function getTarget($trigger) {
        var selector = $trigger.attr("data-target") || ($trigger.attr("href") && $trigger.attr("href").replace(/.*(?=#[^\s]+$)/, ""));
        return $(document).find(selector);
    }

    var old = $.fn.collapse;

    $.fn.collapse = function(option) {
        return this.each(function() {
            var $this = $(this);
            var data = $this.data("bs.collapse");
            var options = $.extend({}, Collapse.DEFAULTS, $this.data(), typeof option == "object" && option);

            if (!data && options.toggle && /show|hide/.test(option)) options.toggle = false;
            if (!data) $this.data("bs.collapse", (data = new Collapse(this, options)));
            if (typeof option == "string") data[option]();
        });
    };

    $.fn.collapse.Constructor = Collapse;

    $.fn.collapse.noConflict = function() {
        $.fn.collapse = old;
        return this;
    };

    $(document).on("click.bs.collapse.data-api", '[data-toggle="collapse"]', function(e) {
        var $this = $(this);
        if (!$this.attr("data-target")) e.preventDefault();
        var $target = getTarget($this);
        var data = $target.data("bs.collapse");
        var option = data ? "toggle" : $this.data();
        $.fn.collapse.call($target, option);
    });

})(jQuery);

define([
  'core/js/adapt',
  'core/js/modelEvent',
  'core/js/views/componentView'
], function(Adapt, ModelEvent, ComponentView) {

  class TrickleButtonView extends ComponentView {

    className() {
      const config = Adapt.trickle.getModelConfig(this.model);
      return [
        'trickle',
        this.model.get('_id'),
        config._button._component,
        config._button._isFullWidth && 'is-full-width',
        config._button._className
      ].filter(Boolean).join(' ');
    }

    events() {
      return {
        'click .js-trickle-btn': 'onButtonClick'
      };
    }

    initialize() {
      this.openPopupCount = 0;
      this.model.calculateButtonPosition();
      this.calculateButtonState();
      this.setupEventListeners();
      this.render();
      _.defer(this.setReadyStatus.bind(this));
      if (!this.model.isEnabled()) {
        this.setCompletionStatus();
      }
    }

    /**
     * Taking into account of open popups, recalculate the button visible and enabled
     * states
     */
    calculateButtonState() {
      const isDisabledByPopups = (this.openPopupCount > 0);
      this.model.calculateButtonState(isDisabledByPopups);
    }

    render() {
      const data = this.model.toJSON();
      data._globals = Adapt.course.get('_globals');
      data._trickle = Adapt.trickle.getModelConfig(this.model);
      this.$el.html(Handlebars.templates[TrickleButtonView.template](data));
    }

    setupEventListeners() {
      _.bindAll(this, 'tryButtonAutoHide');
      this.listenTo(Adapt.parentView, 'postRemove', this.onRemove);
      this.$el.on('onscreen', this.tryButtonAutoHide);
      this.listenTo(Adapt, {
        'trickle:kill': this.updateButtonState,
        'popup:opened': this.onPopupOpened,
        'popup:closed': this.onPopupClosed
      });
      const parentModel = this.model.getParent();
      const completionAttribute = Adapt.trickle.getCompletionAttribute();
      this.listenTo(parentModel, {
        [`bubble:change:${completionAttribute}`]: this.onStepUnlocked,
        [`change:${completionAttribute}`]: this.onParentComplete
      });
    }

    /**
     * Keep count of the number of open popups
     */
    onPopupOpened() {
      const shouldUserInteractWithButton = (this.model.isStepUnlocked() && !this.model.isFinished());
      if (!shouldUserInteractWithButton) return;
      this.openPopupCount++;
      this.updateButtonState();
    }

    /**
     * Keep count of the number of open popups
     */
    async onPopupClosed() {
      const shouldUserInteractWithButton = (this.model.isStepUnlocked() && !this.model.isFinished());
      if (!shouldUserInteractWithButton) return;
      this.openPopupCount--;
      this.updateButtonState();
      await Adapt.parentView.addChildren();
    }

    /**
     * Modify the DOM according to the current button states
     */
    updateButtonState() {
      this.calculateButtonState();
      const isButtonHidden = !(this.model.get('_isButtonVisible') && !this.model.get('_isButtonAutoHidden'));
      this.$('.js-trickle-btn-container').toggleClass('u-display-none', isButtonHidden);
      const isButtonDisabled = this.model.get('_isButtonDisabled');
      const $button = this.$('.js-trickle-btn');
      $button.toggleClass('is-disabled', isButtonDisabled);
      if (isButtonDisabled) {
        $button.attr('disabled', 'disabled');
      } else {
        $button.removeAttr('disabled');
        // move focus forward if it's on the aria-label
        if (document.activeElement instanceof HTMLElement && document.activeElement.isSameNode(this.$('.aria-label')[0])) {
          this.$('.aria-label').focusNext();
        }
        // make label unfocusable as it is no longer needed
        this.$('.aria-label').a11y_cntrl(false);
      }
      const $buttonText = this.$('.js-trickle-btn-text');
      const text = this.model.get('buttonText');
      $buttonText.html(text);
      const ariaLabel = this.model.get('buttonAriaLabel');
      $button.attr('aria-label', ariaLabel);
    }

    /**
     * Update the button state when any of the completion changes occur in the trickle site
     * @param {ModelEvent} event
     */
    async onStepUnlocked(event) {
      if (event.value === false) return;
      // Defer to allow for a feedback notify to open
      _.defer(this.updateButtonState.bind(this));
    }

    async onButtonClick() {
      const wasComplete = this.model.get('_isComplete');
      // Assuming step locking completion is required, setting this model as complete
      // will cause onParentComplete to fire
      this.model.setCompletionStatus();
      const isStepLockingCompletionRequired = this.model.isStepLockingCompletionRequired();
      if (isStepLockingCompletionRequired && !wasComplete) return;
      // Assuming step locking completion is NOT required, continue and scroll
      await this.continue();
    }

    /**
     * Fires when all children in the button parent are complete, including the button
     */
    async onParentComplete(model, value) {
      if (!value) return;
      const parentModel = this.model.getParent();
      const completionAttribute = Adapt.trickle.getCompletionAttribute();
      this.stopListening(parentModel, {
        [`bubble:change:${completionAttribute}`]: this.onStepUnlocked,
        [`change:${completionAttribute}`]: this.onParentComplete
      });
      this.stopListening(Adapt, {
        'popup:opened': this.onPopupOpened,
        'popup:closed': this.onPopupClosed
      });
      if (Adapt.trickle.isKilled) return;
      this.updateButtonState();
      const isStepLockingCompletionRequired = this.model.isStepLockingCompletionRequired();
      if (!isStepLockingCompletionRequired) return;
      // Continue and scroll only if steplocking completion is required
      await this.continue();
    }

    /**
     * Causes Adapt to attempt to render more children and scroll to the next content
     * element if required
     */
    async continue() {
      const parent = this.model.getParent();
      await Adapt.trickle.continue();
      await Adapt.trickle.scroll(parent);
    }

    tryButtonAutoHide() {
      if (!this.model.get('_isButtonVisible')) return;
      const trickleConfig = Adapt.trickle.getModelConfig(this.model);
      if (!trickleConfig._button._autoHide) {
        this.model.set('_isButtonAutoHidden', false);
        return;
      }
      const measurements = this.$el.onscreen();
      // This is to fix common miscalculation issues
      const isJustOffscreen = (measurements.bottom > -100);
      const isButtonAutoHidden = !(measurements.onscreen || isJustOffscreen);
      this.model.set('_isButtonAutoHidden', isButtonAutoHidden);
      this.updateButtonState();
    }

    onRemove() {
      this.$el.off('onscreen', this.tryButtonAutoHide);
      this.remove();
    }

  }

  TrickleButtonView.template = 'trickle-button';

  return TrickleButtonView;

});

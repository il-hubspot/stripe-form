jQuery(document).ready(function($) {
  if (!window.__stripeForm) {
    return;
  }
  $(".stripe-form:not(.init)").addClass("init").each(function() {
    var o = $(this);
    var info = window.__stripeForm[o.data("module-id")];
    if (!info) {
      console.warn("No info for module: ", o);
      return;
    }
    var stripe = Stripe(info.stripeKey);
    var secretPromise = $.ajax({
      url: info.apiUrl,
      type: "POST",
      dataType: "json",
      contentType: "application/json; charset=utf-8",
      data: JSON.stringify({
        token: info.token,
        signature: info.signature
      })
    });
    var id = o.attr("id");
    var elements = stripe.elements();
    var card = elements.create("card");
    var cardElemId = "stripe-card-" + id;
    var cardElem;
    var paymentMethod = null;
    var cardComplete = false;
    var submitted = false;
    hbspt.forms.create({
      portalId: info.portalId,
      formId: info.formId,
      target: "#" + id,
      inlineMessage: "Processing your payment, please do not navigate away from this page...",
      formInstanceId: id,
      goToWebinarWebinarKey: info.gtwKey || undefined,
      onFormReady: function($form) {
        if (!$("#" + $form.attr("id")).length) {
          $form.text("Please enable 'Set as raw HTML form' at 'Style & Preview' tab in form settings.");
          return;
        }
        var transactionIdField = $form.find("[name=stripe_form_transaction_id]").val("").change();
        if (!transactionIdField.length || !transactionIdField.prop("required")) {
          $form.text("Please add 'Stripe Form: Transaction ID' field to your selected form and set it as required field. This field is needed for payment feature and invisible from user.");
          return;
        }
        transactionIdField.closest(".hs-form-field").hide();
        cardElem = $("<div/>").attr("id", cardElemId).insertAfter($form.find(".hs-form-field").last());
        card.mount("#" + cardElemId);
        var cardError = $("<div/>").addClass("card-error").insertAfter(cardElem);
        var cardVersion = 0;
        card.addEventListener('change', function (ev) {
          cardVersion++;
          paymentMethod = null;
          cardComplete = ev.complete;
          var error = ev.error;
          if (error) {
            cardError.text(error.message);
          } else {
            cardError.text("");
          }
          transactionIdField.val("").change();
        });
        secretPromise.fail(function(xhr, error, status) {
          console.error(error, status, xhr);
          cardElem.text("Sorry, we are experiencing technical issues and payment form is not usable at this moment, please try again later.");
        });
        $form.submit(function() {
          if (paymentMethod || !cardComplete) {
            $form.find(".hs_error_rollup").show();
            return;
          }
          setTimeout(function() {
            if (paymentMethod || !cardComplete) {
              $form.find(".hs_error_rollup").show();
              return;
            }
            var hasError = false;
            var fields = $form.find(".hs-form-field:visible");
            fields.each(function() {
              hasError = hasError || !!$(".hs-error-msgs", this).children().length;
            });
            if (hasError) {
              $form.find(".hs_error_rollup").show();
              return;
            }
            $form.find(".hs_error_rollup").hide();
            cardError.text("Validating card information...");
            var v = cardVersion;
            cardComplete = false;
            stripe.createPaymentMethod({
              type: 'card',
              card: card,
            }).then(function(result) {
              if (v !== cardVersion) {
                return;
              }
              if (result.error) {
                cardError.text(result.error.message);
              } else {
                paymentMethod = result.paymentMethod;
                secretPromise.done(function(resp) {
                  if (v !== cardVersion) {
                    return;
                  }
                  cardError.text("");
                  transactionIdField.val(resp.transactionId).change();
                  setTimeout(function() {
                    $form.find(".hs_error_rollup").show();
                    $form.find(".actions input[type=submit]").click();
                  }, 10);
                });
              }
            }).catch(function(e) {
              if (v !== cardVersion) {
                return;
              }
              cardError.text("Sorry, we couldn't validate your card: " + e.toString());
            });
          }, 10);
        });
      },
      onFormSubmitted: function() {
        secretPromise.done(function(resp) {
          stripe.confirmCardPayment(resp.secret, {
            payment_method: paymentMethod.id
          }).then(function(result) {
            if (result.error) {
              o.find(".submitted-message").text("Sorry, we failed to complete your payment: " + result.error.message);
            } else {
              if (result.paymentIntent.status === 'succeeded') {
                if (info.responseType === "inline") {
                  o.find(".submitted-message").html(info.message);
                } else {
                  location.href = info.redirectUrl;
                }
              } else {
                console.warn(result);
                o.find(".submitted-message").text("Sorry, we failed to complete your payment due to unknown reason, please contact us to resolve the issue.");
              }
            }
          }).catch(function(e) {
            console.error(e);
            o.find(".submitted-message").text("Sorry, we failed to complete your payment due to unknown reason, please try again later.");
          });
        });
      }
    });
  });
});
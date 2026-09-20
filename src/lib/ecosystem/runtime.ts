/**
 * Client runtime injected into published sites (the site's own HTML is
 * sanitized, so this trusted script is added by Keystone, not the model).
 * It wires the declarative integration blocks the generator emits:
 *
 *   <button data-kx-support="creator-slug" data-kx-amount="500">Support</button>
 *   <button data-kx-buy="halo-product-id">Buy</button>
 *   <form data-kx-subscribe="audience-id"><input type="email" name="email" required>...</form>
 *
 * Clicks broker a checkout (or fail-soft link-out); the subscribe form posts an
 * email and reports honestly (never a fake success).
 */
export const ecosystemRuntime = (apiBase: string): string =>
  `<script>(function(){
  var API = ${JSON.stringify(apiBase)};
  function post(path, payload){
    return fetch(API + path, { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(payload) }).then(function(r){ return r.json(); });
  }
  document.addEventListener("click", function(e){
    var el = e.target.closest && e.target.closest("[data-kx-support],[data-kx-buy]");
    if(!el){ return; }
    e.preventDefault();
    var support = el.hasAttribute("data-kx-support");
    var path = support ? "/api/ecosystem/support/checkout" : "/api/ecosystem/buy/checkout";
    var payload = support
      ? { slug: el.getAttribute("data-kx-support"), amountCents: parseInt(el.getAttribute("data-kx-amount")||"500",10) }
      : { productId: el.getAttribute("data-kx-buy") };
    post(path, payload).then(function(d){ if(d && d.url){ window.location.href = d.url; } }).catch(function(){});
  }, true);
  document.addEventListener("submit", function(e){
    var form = e.target.closest && e.target.closest("form[data-kx-subscribe]");
    if(!form){ return; }
    e.preventDefault();
    var input = form.querySelector("input[type=email],input[name=email]");
    var email = input && input.value;
    if(!email){ return; }
    post("/api/ecosystem/subscribe", { audienceId: form.getAttribute("data-kx-subscribe"), email: email })
      .then(function(d){ form.setAttribute("data-kx-state", d && d.ok ? "ok" : "error"); if(d && d.ok){ form.innerHTML = "<p>Thanks, you are subscribed.</p>"; } })
      .catch(function(){ form.setAttribute("data-kx-state","error"); });
  }, true);
})();</script>`;

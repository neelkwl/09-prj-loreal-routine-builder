/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const sendBtn = document.getElementById("sendBtn");
const productSearch = document.getElementById("productSearch");

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  // reset displayedProducts map for the new list
  displayedProducts = {};

  productsContainer.innerHTML = products
    .map((product, i) => {
      // ensure each card has a stable id (fallback to index-based id)
      const pid = product.id || `prod-${i}`;
      const nameEsc = escapeHtml(product.name || "");
      const descEsc = escapeHtml(product.description || "");

      // store the product for later use when generating a routine
      displayedProducts[pid] = product;

      return `
    <div class="product-card" data-id="${pid}" data-name="${nameEsc}" tabindex="0">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3 class="product-name">${product.name}</h3>
        <p>${product.brand}</p>
      </div>
      <div class="product-overlay" id="overlay-${pid}">${descEsc}</div>
    </div>
  `;
    })
    .join("");

  // highlight any cards that are already selected (restored from storage)
  for (const id of selectedProducts.keys()) {
    const card = productsContainer.querySelector(
      `.product-card[data-id="${id}"]`
    );
    if (card) setCardSelected(card, true);
  }
}

// Small helper to escape HTML when inserting AI text into the page
function escapeForHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Utility to escape quotes if used inside data attributes */
function escapeHtml(str) {
  return String(str).replace(/"/g, "&quot;");
}

// Conversation memory: start with a general system message describing the assistant
const baseSystemMessage = {
  role: "system",
  content:
    "You are a helpful, expert skincare and personal-care assistant. Answer user questions about routines, products, skincare, haircare, makeup, and fragrance using the conversation history.",
};

// Full conversation array (messages) we'll send to the proxy. Start with the base system message.
const conversation = [baseSystemMessage];

// All products cache and current filter state
let allProducts = [];
let currentCategory = "";
let currentSearch = "";

// Render a chat message into the chat window and scroll to bottom
function renderChatMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;
  wrapper.innerHTML = `<div class="msg-role">${role}</div><div class="msg-content">${escapeForHtml(
    text
  ).replace(/\n/g, "<br>")}</div>`;
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Simple debounce helper
function debounce(fn, delay = 200) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Apply current category + search filters and render
function applyFilters() {
  let items = Array.isArray(allProducts) ? allProducts.slice() : [];
  if (currentCategory) {
    items = items.filter((p) => p.category === currentCategory);
  }

  const q = (currentSearch || "").trim().toLowerCase();
  if (q) {
    items = items.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const brand = (p.brand || "").toLowerCase();
      const desc = (p.description || "").toLowerCase();
      const cat = (p.category || "").toLowerCase();
      return (
        name.includes(q) ||
        brand.includes(q) ||
        desc.includes(q) ||
        cat.includes(q)
      );
    });
  }

  displayProducts(items);
}

// Helper to post messages to the worker proxy and return assistant reply text
async function callProxyWithConversation(messages) {
  const resp = await fetch("https://loreal.neelkhandelwal0807.workers.dev/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o", messages }),
  });

  const data = await resp.json();
  return (
    data?.choices?.[0]?.message?.content ||
    data?.result ||
    data?.text ||
    JSON.stringify(data)
  );
}

// Selection state: map of id -> {id, name}
const selectedProducts = new Map();
// Map of id -> full product object for the most recently displayed list
let displayedProducts = {};

// Render the selected products list (in the aside area)
function renderSelectedList() {
  const listEl = document.getElementById("selectedProductsList");
  const countEl = document.getElementById("selected-count");

  listEl.innerHTML = "";

  selectedProducts.forEach((prod) => {
    const li = document.createElement("li");
    li.className = "selected-item";
    li.innerHTML = `
      <span class="sel-name">${prod.name}</span>
      <button class="remove-btn" data-id="${prod.id}" aria-label="Remove ${prod.name}">Remove</button>
    `;
    listEl.appendChild(li);
  });

  countEl.textContent = String(selectedProducts.size);
  // persist current selection to localStorage
  saveSelectedToStorage();
}

function saveSelectedToStorage() {
  try {
    const arr = Array.from(selectedProducts.values());
    localStorage.setItem("selectedProducts", JSON.stringify(arr));
  } catch (err) {
    console.error("Error saving selected products", err);
  }
}

function loadSelectedFromStorage() {
  try {
    const raw = localStorage.getItem("selectedProducts");
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    selectedProducts.clear();
    arr.forEach((p) => {
      if (p && p.id) selectedProducts.set(p.id, p);
    });
    renderSelectedList();
  } catch (err) {
    console.error("Error loading selected products", err);
  }
}

// Toggle visual state of a product card
function setCardSelected(cardEl, isSelected) {
  if (!cardEl) return;
  cardEl.classList.toggle("selected", isSelected);
}

// Event delegation: click on productsContainer toggles selection
productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");
  if (!card) return; // click outside a card

  const id = card.dataset.id;
  const name =
    card.dataset.name ||
    card.querySelector(".product-name")?.textContent?.trim() ||
    "Product";

  if (selectedProducts.has(id)) {
    selectedProducts.delete(id);
    setCardSelected(card, false);
  } else {
    // include additional product info when available
    const prod = displayedProducts[id] || {};
    const entry = {
      id,
      name,
      brand: prod.brand || "",
      category: prod.category || "",
      description: prod.description || "",
      image: prod.image || "",
    };
    selectedProducts.set(id, entry);
    setCardSelected(card, true);
  }

  renderSelectedList();
});

// Allow removing from selected list via button
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  if (!id) return;

  selectedProducts.delete(id);

  // Un-highlight card if present
  const card = document.querySelector(`.product-card[data-id="${id}"]`);
  if (card) setCardSelected(card, false);

  renderSelectedList();
});

// Clear all selections button
const clearBtn = document.getElementById("clearSelections");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    selectedProducts.clear();
    // remove selected class from any cards
    document
      .querySelectorAll(".product-card.selected")
      .forEach((c) => c.classList.remove("selected"));
    saveSelectedToStorage();
    renderSelectedList();
  });
}

/* Generate routine: send selected products to the OpenAI proxy and show result */
const generateBtn = document.getElementById("generateRoutine");
if (generateBtn) {
  generateBtn.addEventListener("click", async () => {
    const ids = Array.from(selectedProducts.keys());
    if (ids.length === 0) {
      renderChatMessage(
        "assistant",
        "Please select one or more products first."
      );
      return;
    }

    // collect minimal product info for the API
    const productsForApi = ids
      .map((id) => displayedProducts[id])
      .filter(Boolean)
      .map((p) => ({
        name: p.name || "",
        brand: p.brand || "",
        category: p.category || "",
        description: p.description || "",
      }));

    const routineSystemMsg = {
      role: "system",
      content:
        "You are an expert skincare and personal-care assistant. Given a list of products, produce a clear, step-by-step personalized routine that uses those products. For each step include when to use it (morning/evening), the order, frequency, and a short reason why.",
    };

    const userMsg = {
      role: "user",
      content:
        "Generate a personalized routine using the selected products (JSON follows). Use only this information to create a step-by-step routine:\n\n" +
        JSON.stringify({ products: productsForApi }, null, 2),
    };

    // add messages to conversation
    conversation.push(routineSystemMsg);
    conversation.push(userMsg);

    // render a compact user note to the chat window and a pending assistant message
    renderChatMessage("user", `Generate routine for ${ids.length} product(s)`);
    renderChatMessage("assistant", "Generating routine...");

    generateBtn.disabled = true;

    try {
      const text = await callProxyWithConversation(conversation);

      // remove the placeholder 'Generating routine...' assistant message (the last assistant msg)
      const assistantPlaceholders = chatWindow.querySelectorAll(
        ".chat-message.assistant"
      );
      for (let i = assistantPlaceholders.length - 1; i >= 0; i--) {
        const el = assistantPlaceholders[i];
        if (el.textContent && el.textContent.includes("Generating routine")) {
          el.remove();
          break;
        }
      }

      // push assistant reply into conversation and render
      conversation.push({ role: "assistant", content: text });
      renderChatMessage("assistant", text);
    } catch (err) {
      console.error(err);
      renderChatMessage(
        "assistant",
        "Error generating routine. See console for details."
      );
    } finally {
      generateBtn.disabled = false;
    }
  });
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  currentCategory = e.target.value;
  // ensure we have the full product list cached
  if (!allProducts.length) {
    allProducts = await loadProducts();
  }
  applyFilters();
});

// After defining handlers, load any saved selections from localStorage
loadSelectedFromStorage();

// Prefetch product list so search works without waiting for a category change
loadProducts().then((p) => {
  allProducts = p || [];
});

// Wire up search input (debounced)
if (productSearch) {
  const onInput = debounce((e) => {
    currentSearch = e.target.value || "";
    // if no category chosen, we still search across all products
    applyFilters();
  }, 220);
  productSearch.addEventListener("input", onInput);
}

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  // push user message to conversation and render
  const userMsg = { role: "user", content: text };
  conversation.push(userMsg);
  renderChatMessage("user", text);

  // show assistant placeholder and disable send
  renderChatMessage("assistant", "Thinking...");
  if (sendBtn) sendBtn.disabled = true;

  try {
    const reply = await callProxyWithConversation(conversation);
    // remove last assistant placeholder that contains 'Thinking...'
    const assistantPlaceholders = chatWindow.querySelectorAll(
      ".chat-message.assistant"
    );
    for (let i = assistantPlaceholders.length - 1; i >= 0; i--) {
      const el = assistantPlaceholders[i];
      if (el.textContent && el.textContent.includes("Thinking")) {
        el.remove();
        break;
      }
    }

    // push assistant reply and render
    conversation.push({ role: "assistant", content: reply });
    renderChatMessage("assistant", reply);
  } catch (err) {
    console.error(err);
    renderChatMessage(
      "assistant",
      "Error contacting API. See console for details."
    );
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    input.value = "";
    input.focus();
  }
});

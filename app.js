/* ============================================================
   ECO-TRACKER — app.js
   All behaviour and logic lives here.
   Organised into sections:
   1.  State (the app's data)
   2.  Helper Utilities
   3.  Data Functions  (save, load, add, delete)
   4.  Date Functions  (calculate days, format text)
   5.  Render Functions (draw cards on screen)
   6.  UI Action Functions (what happens when user clicks)
   7.  AI Recipe Feature (call Claude API)
   8.  Modal Functions
   9.  Toast Notification
   10. Keyboard Shortcut
   11. Startup (seed data + first render)
============================================================ */


/* ─────────────────────────────────────────
   1. STATE
   These two variables hold the app's "memory"
   while it is running.
───────────────────────────────────────── */

// "items" is an array of food objects.
// It is loaded from localStorage when the page opens.
let items = loadItems();

// "activeFilter" tracks which pill is selected.
// Possible values: 'all', 'fresh', 'expiring', 'expired'
let activeFilter = 'all';


/* ─────────────────────────────────────────
   2. HELPER UTILITIES
───────────────────────────────────────── */

/**
 * generateId()
 * Creates a short random string used as a unique ID for each item.
 * Example output: "k7x2mq9ab"
 *
 * How it works:
 *   Math.random()   → a random decimal, e.g. 0.74321...
 *   .toString(36)   → convert to base-36 (uses a–z and 0–9): "0.l4x8k..."
 *   .slice(2, 11)   → remove the "0." prefix, keep 9 characters: "l4x8k9qmz"
 */
function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

/**
 * escapeHtml(str)
 * Converts dangerous HTML characters into safe text.
 * This PREVENTS XSS attacks — if a user types <script>... as a food name
 * and we put it directly into innerHTML, the browser would run it as code!
 * escapeHtml() turns < into &lt; so it displays as text instead.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/**
 * formatDate(date)
 * Converts a Date object into a readable string.
 * Example: Date(2025-04-10) → "10 Apr 2025"
 */
function formatDate(date) {
  return date.toLocaleDateString('en-IN', {
    day:   'numeric',
    month: 'short',
    year:  'numeric'
  });
}


/* ─────────────────────────────────────────
   3. DATA FUNCTIONS
   Save, load, add, and delete food items.
───────────────────────────────────────── */

/**
 * saveItems()
 * Converts the items array to a text string and stores it in localStorage.
 *
 * WHY: localStorage can only store text (strings), not JavaScript objects.
 * So we:
 *   1. Convert each Date object → ISO string ("2025-04-10T00:00:00.000Z")
 *   2. Convert the whole array → JSON string with JSON.stringify()
 *   3. Store that string under the key 'eco-tracker-items'
 */
function saveItems() {
  try {
    // Step 1: Convert Date objects to strings (localStorage can't store Date objects)
    const serialized = items.map(function(item) {
      return {
        id:         item.id,
        name:       item.name,
        category:   item.category,
        expiryDate: item.expiryDate.toISOString() // Date → text
      };
    });

    // Step 2 & 3: Convert array to JSON text and save
    localStorage.setItem('eco-tracker-items', JSON.stringify(serialized));

  } catch (error) {
    // If storage is full or disabled, just log a warning — don't crash
    console.warn('Could not save to localStorage:', error);
  }
}

/**
 * loadItems()
 * Reads saved data from localStorage and converts it back into usable objects.
 *
 * This is the REVERSE of saveItems():
 *   1. Read the JSON string from localStorage
 *   2. Parse it back into an array with JSON.parse()
 *   3. Convert ISO date strings back into real Date objects
 */
function loadItems() {
  try {
    const raw = localStorage.getItem('eco-tracker-items');

    // If nothing is saved yet, return an empty array
    if (!raw) return [];

    // Parse the JSON string back into an array, and fix the dates
    return JSON.parse(raw).map(function(item) {
      return {
        id:         item.id,
        name:       item.name,
        category:   item.category,
        expiryDate: new Date(item.expiryDate) // text → Date object
      };
    });

  } catch (error) {
    // If saved data is corrupt, start fresh
    return [];
  }
}

/**
 * addItemToStore(name, expiryDate)
 * Creates a new food item object and adds it to the items array.
 *
 * A food item object looks like:
 * {
 *   id: "ab3cd9f",
 *   name: "Avocado",
 *   expiryDate: Date(2025-04-10),
 *   category: "general"
 * }
 */
function addItemToStore(name, expiryDate) {
  var newItem = {
    id:         generateId(),  // Unique ID for this item
    name:       name.trim(),   // .trim() removes accidental spaces
    expiryDate: expiryDate,    // The Date object
    category:   'general'      // Could extend to 'dairy', 'veg', 'fruit' etc.
  };

  items.push(newItem); // Add to end of the array
  saveItems();         // Immediately persist to localStorage
  return newItem;      // Return in case the caller needs it
}

/**
 * deleteItemById(id)
 * Removes one item from the array using its unique ID.
 *
 * .filter() creates a NEW array that only keeps items where
 * the condition is true (i.id !== id means "keep everything EXCEPT the one we want to delete").
 */
function deleteItemById(id) {
  items = items.filter(function(item) {
    return item.id !== id; // Keep item if its ID does NOT match
  });
  saveItems(); // Save the updated array
}


/* ─────────────────────────────────────────
   4. DATE FUNCTIONS
───────────────────────────────────────── */

/**
 * getDaysInfo(expiryDate)
 * Calculates how many days until (or since) an item expires.
 * Also determines the status: 'fresh', 'expiring', or 'expired'.
 *
 * Returns an object: { days: 3, status: 'expiring' }
 */
function getDaysInfo(expiryDate) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);  // Reset to midnight — ignore time of day

  var expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0); // Same for expiry date

  // Subtract dates — result is in milliseconds
  var diffMs = expiry - today;

  // Convert milliseconds → days
  // 1 day = 1000ms × 60s × 60m × 24h = 86,400,000ms
  var days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  // Math.ceil rounds UP (e.g. 1.2 days → 2) so we don't prematurely expire items

  // Determine status based on days remaining
  var status;
  if (days > 3)       status = 'fresh';    // More than 3 days left
  else if (days >= 0) status = 'expiring'; // 0 to 3 days left
  else                status = 'expired';  // Already past expiry

  return { days: days, status: status };
}

/**
 * formatDaysText(days, status)
 * Converts a raw number like -3 into a friendly string like "Expired 3 days ago".
 */
function formatDaysText(days, status) {
  if (status === 'expired') {
    if (days === -1) return 'Expired yesterday';
    return 'Expired ' + Math.abs(days) + ' days ago'; // Math.abs removes the minus sign
  }
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return days + ' days left';
}


/* ─────────────────────────────────────────
   5. RENDER FUNCTIONS
   These functions UPDATE what is shown on screen
   by writing HTML into the DOM.
───────────────────────────────────────── */

/**
 * renderGrid()
 * The most important function.
 * Reads the items array, applies the active filter,
 * and builds the HTML for all the food cards.
 * Then inserts that HTML into the #inventory-grid div.
 */
function renderGrid() {
  // Find the grid container in the HTML
  var grid = document.getElementById('inventory-grid');

  // Apply the active filter
  var filtered;
  if (activeFilter === 'all') {
    filtered = items; // Show everything
  } else {
    filtered = items.filter(function(item) {
      return getDaysInfo(item.expiryDate).status === activeFilter;
    });
  }

  // Also update the count numbers in the stat cards
  updateStats();

  // If no items match, show a friendly empty message
  if (filtered.length === 0) {
    var emptyMessage = activeFilter === 'all'
      ? 'Your fridge is empty!'
      : 'No ' + activeFilter + ' items.';
    var emptySub = activeFilter === 'all'
      ? 'Add your first item above to start tracking.'
      : 'Try a different filter.';

    grid.innerHTML =
      '<div class="empty-state">' +
        '<span class="empty-icon">🥦</span>' +
        '<p>' + emptyMessage + '</p>' +
        '<p class="empty-sub">' + emptySub + '</p>' +
      '</div>';
    return; // Stop — nothing more to render
  }

  // Build one HTML string for ALL cards combined
  // .map() transforms each item into a card HTML string
  // .join('') glues them all into one big string
  var cardsHTML = filtered.map(function(item) {
    var info      = getDaysInfo(item.expiryDate);
    var days      = info.days;
    var status    = info.status;
    var daysText  = formatDaysText(days, status);
    var badgeLabel = status === 'fresh'
      ? 'Fresh'
      : status === 'expiring'
        ? 'Expiring Soon'
        : 'Expired';

    // Template literal: a string with dynamic values embedded
    return (
      '<div class="food-card ' + status + '" data-id="' + item.id + '">' +

        '<div class="card-top">' +
          '<div class="item-name">' + escapeHtml(item.name) + '</div>' +
          // onclick passes the item's ID to deleteItem()
          '<button class="delete-btn" onclick="deleteItem(\'' + item.id + '\')" ' +
            'title="Delete item" aria-label="Delete ' + escapeHtml(item.name) + '">' +
            // Inline SVG trash icon
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<polyline points="3 6 5 6 21 6"/>' +
              '<path d="M19 6l-1 14H6L5 6"/>' +
              '<path d="M10 11v6"/>' +
              '<path d="M14 11v6"/>' +
              '<path d="M9 6V4h6v2"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +

        '<div class="badge ' + status + '">' +
          '<span class="badge-dot"></span>' + badgeLabel +
        '</div>' +

        '<div class="days-left"><strong>' + daysText + '</strong></div>' +

        '<div class="expiry-date">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
            '<line x1="16" y1="2" x2="16" y2="6"/>' +
            '<line x1="8" y1="2" x2="8" y2="6"/>' +
            '<line x1="3" y1="10" x2="21" y2="10"/>' +
          '</svg>' +
          formatDate(item.expiryDate) +
        '</div>' +

      '</div>'
    );
  }).join(''); // Combine all card strings

  grid.innerHTML = cardsHTML; // Write all cards into the page
}

/**
 * updateStats()
 * Counts how many items are in each status
 * and updates the three stat boxes at the top.
 */
function updateStats() {
  var counts = { fresh: 0, expiring: 0, expired: 0 };

  // Loop through every item and count by status
  items.forEach(function(item) {
    var status = getDaysInfo(item.expiryDate).status;
    counts[status]++; // e.g. counts['fresh']++ increments fresh count
  });

  // Write the counts into the DOM
  document.getElementById('stat-fresh').textContent    = counts.fresh;
  document.getElementById('stat-expiring').textContent = counts.expiring;
  document.getElementById('stat-expired').textContent  = counts.expired;
}


/* ─────────────────────────────────────────
   6. UI ACTION FUNCTIONS
   These respond to user interactions.
───────────────────────────────────────── */

/**
 * addItem()
 * Called when user clicks "+ Add Item" button.
 * 1. Reads values from the form inputs
 * 2. Validates them (not empty)
 * 3. Saves the item
 * 4. Clears the form
 * 5. Re-renders the grid
 */
function addItem() {
  // Find the two input elements
  var nameInput = document.getElementById('item-name');
  var dateInput = document.getElementById('expiry-date');

  // Read the values the user typed
  var name    = nameInput.value.trim(); // .trim() removes leading/trailing spaces
  var dateVal = dateInput.value;        // e.g. "2025-04-10" (a string)

  // Validate — stop if either field is empty
  if (!name) {
    showToast('Please enter an item name');
    nameInput.focus(); // Move cursor to the empty field
    return;            // Exit the function early
  }
  if (!dateVal) {
    showToast('Please select an expiry date');
    dateInput.focus();
    return;
  }

  // Convert the date string "2025-04-10" into a real Date object
  // We add T00:00:00 to force midnight local time and avoid timezone bugs
  var expiryDate = new Date(dateVal + 'T00:00:00');

  // Save to our array + localStorage
  addItemToStore(name, expiryDate);

  // Clear the form for the next entry
  nameInput.value = '';
  dateInput.value = '';

  // Re-draw all the cards
  renderGrid();

  // Show a success message at the bottom
  showToast('"' + name + '" added to your tracker');

  // Move cursor back to name field, ready for next item
  nameInput.focus();
}

/**
 * deleteItem(id)
 * Called when user clicks the trash icon on a card.
 * Removes the item from data, then refreshes the grid.
 */
function deleteItem(id) {
  deleteItemById(id);
  renderGrid();
  showToast('Item removed');
}

/**
 * setFilter(filter, el)
 * Called when user clicks a filter pill.
 *
 * Parameters:
 *   filter — string: 'all', 'fresh', 'expiring', or 'expired'
 *   el     — the button element that was clicked (passed as "this" in HTML)
 */
function setFilter(filter, el) {
  activeFilter = filter; // Update global state

  // Remove 'active' class from ALL pills
  document.querySelectorAll('.pill').forEach(function(pill) {
    pill.classList.remove('active');
  });

  // Add 'active' class only to the clicked pill
  // CSS sees this class and applies the highlighted colour
  el.classList.add('active');

  // Re-render the grid with the new filter
  renderGrid();
}


/* ─────────────────────────────────────────
   7. AI RECIPE FEATURE
   Calls the Anthropic API to get a recipe
   based on the user's expiring ingredients.
───────────────────────────────────────── */

/**
 * fetchRecipe()
 * Main AI function. Steps:
 * 1. Find expiring/fresh items to use as ingredients
 * 2. Show a loading spinner
 * 3. Send a prompt to the Claude API
 * 4. Display the recipe response
 *
 * "async" means this function uses "await" to pause
 * while waiting for the API to respond.
 */
async function fetchRecipe() {
  // Grab the DOM elements we'll update
  var output     = document.getElementById('recipe-output');
  var ctxText    = document.getElementById('context-text');
  var retryBtn   = document.getElementById('retry-btn');

  // Disable the Regenerate button while loading
  retryBtn.disabled = true;

  // Step 1: Find items that are expiring or fresh (not expired)
  var expiringItems = items.filter(function(item) {
    var status = getDaysInfo(item.expiryDate).status;
    return status === 'expiring' || status === 'fresh';
  });

  // Guard clause: no items to work with
  if (expiringItems.length === 0) {
    ctxText.textContent = 'No items found. Add some food with upcoming expiry dates!';
    output.innerHTML =
      '<div class="recipe-error">' +
        'You don\'t have any expiring items right now. ' +
        'Add food items to get a tailored recipe!' +
      '</div>';
    retryBtn.disabled = false;
    return;
  }

  // Step 2: Build the ingredient list string
  // .map() extracts just the name from each item
  // .join(', ') turns the array into "Spinach, Yogurt, Bread"
  var itemList = expiringItems.map(function(item) {
    return item.name;
  }).join(', ');

  ctxText.textContent = 'Using your ingredients: ' + itemList;

  // Step 3: Show loading spinner while waiting for API
  output.innerHTML =
    '<div class="loading">' +
      '<div class="spinner"></div>' +
      '<span>Crafting a recipe just for you…</span>' +
    '</div>';

  // Step 4: Build the prompt we'll send to Claude
  var prompt =
    'I have these ingredients that need to be used: ' + itemList + '. ' +
    'Suggest one quick recipe using some or all of them. ' +
    'Format your response EXACTLY like this:\n' +
    'RECIPE NAME: [Name]\n' +
    'DESCRIPTION: [One sentence]\n' +
    'STEP 1: [First step]\n' +
    'STEP 2: [Second step]\n' +
    'STEP 3: [Third step]\n' +
    'Keep it simple, practical, and delicious. Be specific with quantities.';

  try {
    // Step 5: Call the Anthropic Claude API
    // "await" pauses here until the server responds (could take 1–3 seconds)
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',                            // We're SENDING data
      headers: {
        'Content-Type': 'application/json',      // Tell server we're sending JSON
      },
      body: JSON.stringify({                     // Convert object → JSON text string
        model:      'claude-sonnet-4-20250514',  // Which Claude model to use
        max_tokens: 1000,                        // Max length of response
        messages: [
          { role: 'user', content: prompt }      // Our question
        ]
      })
    });

    // Step 6: If the server returned an error status, throw an error
    if (!response.ok) {
      var errData = await response.json().catch(function() { return {}; });
      throw new Error(errData.error?.message || 'API error ' + response.status);
    }

    // Step 7: Parse the JSON response body
    // "await" pauses again while the response body is read and parsed
    var data = await response.json();

    // The API returns: { content: [ { type: "text", text: "..." } ] }
    // We extract the text from each content block and join them
    var text = data.content
      .map(function(block) { return block.text || ''; })
      .join('')
      .trim();

    if (!text) throw new Error('Empty response from AI');

    // Step 8: Render the recipe text as styled HTML
    renderRecipeText(text, output);

    retryBtn.disabled = false; // Re-enable the Regenerate button

  } catch (error) {
    // If ANYTHING fails (network down, API error, parsing error), show friendly message
    console.error('Recipe fetch error:', error);
    output.innerHTML =
      '<div class="recipe-error">' +
        '<strong>Couldn\'t fetch a recipe right now.</strong><br/><br/>' +
        (error.message || 'An unknown error occurred. Please try again.') +
      '</div>';
    retryBtn.disabled = false;
  }
}

/**
 * renderRecipeText(text, container)
 * Takes the AI's plain text response and converts it
 * into nicely styled HTML with step blocks.
 *
 * It reads the text line-by-line and checks which
 * type of line each one is (title, description, or step).
 */
function renderRecipeText(text, container) {
  // Split the full text into individual lines
  // .filter(Boolean) removes empty lines
  var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);

  var html = '';

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (line.startsWith('RECIPE NAME:')) {
      // Extract just the name part after "RECIPE NAME: "
      var name = line.replace('RECIPE NAME:', '').trim();
      html += '<div class="recipe-title">🍽️ ' + escapeHtml(name) + '</div>';

    } else if (line.startsWith('DESCRIPTION:')) {
      var desc = line.replace('DESCRIPTION:', '').trim();
      html += '<p style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.6;">' + escapeHtml(desc) + '</p>';

    } else if (/^STEP\s+\d+:/.test(line)) {
      // Regular expression checks if line starts with "STEP 1:", "STEP 2:", etc.
      var match = line.match(/^STEP\s+(\d+):\s*(.*)/);
      if (match) {
        // match[1] is the step number, match[2] is the step text
        html +=
          '<div class="recipe-step">' +
            '<span class="step-num">' + match[1] + '.</span>' +
            '<span class="step-text">' + escapeHtml(match[2]) + '</span>' +
          '</div>';
      }
    }
    // Any other lines are silently skipped
  }

  container.innerHTML = '<div class="recipe-text">' + html + '</div>';
}


/* ─────────────────────────────────────────
   8. MODAL FUNCTIONS
───────────────────────────────────────── */

/**
 * openModal()
 * Shows the Magic Recipe modal overlay.
 * Immediately starts fetching the AI recipe.
 */
function openModal() {
  // Adding class "open" triggers CSS: display: none → display: flex
  document.getElementById('modal-backdrop').classList.add('open');

  // Prevent the page behind from scrolling while modal is open
  document.body.style.overflow = 'hidden';

  // Reset modal to a clean state
  document.getElementById('recipe-output').innerHTML = '';
  document.getElementById('context-text').textContent = 'Generating a recipe using your expiring ingredients…';
  document.getElementById('retry-btn').disabled = true;

  // Start fetching the recipe right away
  fetchRecipe();
}

/**
 * closeModal()
 * Hides the Magic Recipe modal.
 */
function closeModal() {
  // Removing class "open" triggers CSS: display: flex → display: none
  document.getElementById('modal-backdrop').classList.remove('open');

  // Re-enable page scrolling
  document.body.style.overflow = '';
}

/**
 * handleBackdropClick(event)
 * Called when the dark overlay is clicked.
 * Closes the modal ONLY if the backdrop itself was clicked,
 * not if the white modal box inside was clicked.
 *
 * event.target = the element that was actually clicked.
 * If it's the backdrop div (not the modal inside it), close.
 */
function handleBackdropClick(event) {
  var backdrop = document.getElementById('modal-backdrop');
  if (event.target === backdrop) {
    closeModal();
  }
}

// Close modal when Escape key is pressed
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    closeModal();
  }
});


/* ─────────────────────────────────────────
   9. TOAST NOTIFICATION
───────────────────────────────────────── */

// We store the timer ID here so we can cancel it if needed
var toastTimer;

/**
 * showToast(message)
 * Shows a small popup message at the bottom of the screen for 2.8 seconds.
 *
 * The toast element starts positioned below the screen (translateY(100px)).
 * Adding class "show" slides it up into view.
 * After 2.8 seconds, we remove "show" and it slides back down.
 */
function showToast(message) {
  var toastEl = document.getElementById('toast');
  toastEl.textContent = message;    // Set the text
  toastEl.classList.add('show');    // Slide it into view (CSS handles animation)

  // Cancel any previous timer (in case another toast was shown recently)
  clearTimeout(toastTimer);

  // Set a new timer to hide the toast after 2.8 seconds
  toastTimer = setTimeout(function() {
    toastEl.classList.remove('show'); // Slide it back down
  }, 2800);
}


/* ─────────────────────────────────────────
   10. KEYBOARD SHORTCUT
   Press Enter in the item name field to add.
───────────────────────────────────────── */
document.getElementById('item-name').addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    addItem();
  }
});


/* ─────────────────────────────────────────
   11. STARTUP
   This runs when the page first loads.
───────────────────────────────────────── */

/**
 * seedIfEmpty()
 * If the user has no saved items (first visit),
 * add some example items so the app doesn't start empty.
 */
function seedIfEmpty() {
  if (items.length > 0) return; // Already have data, skip seeding

  var today = new Date();

  // Helper: create a date that is N days from today
  function daysFromToday(n) {
    var d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  }

  // Sample items with varying expiry dates
  var seedData = [
    { name: 'Greek Yogurt',      days: 1  },
    { name: 'Baby Spinach',      days: 2  },
    { name: 'Cherry Tomatoes',   days: 5  },
    { name: 'Cheddar Cheese',    days: -2 }, // Already expired
    { name: 'Sourdough Bread',   days: 3  },
    { name: 'Eggs',              days: 14 },
  ];

  seedData.forEach(function(seed) {
    addItemToStore(seed.name, daysFromToday(seed.days));
  });
}

// Run startup sequence:
seedIfEmpty(); // Add demo data if first visit
renderGrid();  // Draw all the cards on screen
const TEST_ACCOUNT = {
  id: "user-demo",
  name: "Alex Rivera",
  username: "@alexcooks",
  email: "demo@dishcover.app",
  password: "Dishcover123!",
  accountType: "individual",
  avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=180&q=85",
  cover: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1500&q=85",
  location: "Cebu City, Philippines",
  age: 27,
  website: "https://dishcover.app/alexcooks",
  isPrivate: false,
  bio: "Home cook, market wanderer, and collector of family recipes. Sharing food that tastes like home."
};

const creators = [
  { name: "Maya Santos", username: "@mayaskitchen", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=85", specialty: "Filipino comfort food" },
  { name: "Marco Bellini", username: "@marcocooks", avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=100&q=85", specialty: "Italian classics" },
  { name: "Hana Mori", username: "@hanastable", avatar: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=100&q=85", specialty: "Japanese home cooking" },
  { name: "Sam Torres", username: "@samtastes", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=85", specialty: "Quick weeknight meals" }
];

const DISH_CATEGORIES = {
  Filipino: ["Adobo", "Rice dishes", "Noodles", "Soups", "Street food", "Main dishes"],
  Italian: ["Pasta", "Pizza", "Bread", "Risotto", "Soups", "Desserts"],
  Japanese: ["Sushi", "Ramen", "Rice bowls", "Grilled", "Hot pot", "Seafood"],
  Chinese: ["Dim sum", "Noodles", "Stir-fry", "Roast", "Soups", "Rice dishes"],
  Western: ["Grill", "Burgers", "Salads", "Sandwiches", "Bakes", "Breakfast"],
  Dessert: ["Cakes", "Pastries", "Ice cream", "Puddings", "Cookies", "Fruit desserts"]
};

const CHAT_THEMES = {
  sage: { name: "Sage", accent: "#536e58", soft: "#dfe8dc", canvas: "#f6f8f3" },
  tomato: { name: "Tomato", accent: "#d95538", soft: "#f7ddd5", canvas: "#fff7f3" },
  ocean: { name: "Ocean", accent: "#397287", soft: "#d9e9ed", canvas: "#f3f8fa" },
  plum: { name: "Plum", accent: "#74506e", soft: "#eaddea", canvas: "#faf5fa" },
  sunset: { name: "Sunset", accent: "#c8753f", soft: "#f4dfcf", canvas: "#fff8f1" }
};

const MESSAGE_REACTIONS = ["❤️", "😋", "😂", "👏", "🔥", "👍"];
const CHAT_EMOJIS = ["❤️", "👍", "🔥", "😋", "😂", "👏", "😍", "🥰", "🍕", "🍝", "🍜", "🍰", "🥑", "🌮", "☕", "🎉"];

let currentUser;
let posts = [];
let conversations = [];
let stories = [];
let activeConversationId;
let activeStoryIndex = -1;
let authMode = "login";
let activeCuisine = "All";
let activeSubcategory = "All";
let toastTimer;
let pendingAvatar;
let pendingCover;
let pendingDishImages = [];
let timelineSteps = [];
let pendingStoryMedia = "";
let pendingMessagePhoto = "";
let storyTimer;
let searchResults = null;
let searchTimer;
let searchRequest;
let socialProviders = { google: false, apple: false };

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  bindEvents();
  try {
    await loadSocialProviders();
    currentUser = await api("/api/auth/session");
    if (currentUser) await showApp();
  } catch (error) {
    if (error.status !== 401) {
      console.error(error);
      showFormError("The Dishcover server is unavailable. Please try again.");
    }
  }
  const parameters = new URLSearchParams(location.search);
  if (parameters.get("socialError")) showFormError(parameters.get("socialError"));
  if (parameters.has("social") || parameters.has("socialError")) history.replaceState({}, "", "/");
}

async function api(path, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { credentials: "same-origin", ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const payload = response.status === 204 ? null : contentType.includes("json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(payload?.detail || payload?.title || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function loadAppData() {
  [posts, conversations, stories] = await Promise.all([api("/api/posts"), api("/api/conversations"), api("/api/stories")]);
  activeConversationId = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
}

async function loadSocialProviders() {
  try {
    socialProviders = await api("/api/auth/providers");
  } catch {
    socialProviders = { google: false, apple: false };
  }
  $$("[data-provider]").forEach((button) => {
    const available = Boolean(socialProviders[button.dataset.provider.toLowerCase()]);
    button.classList.toggle("unavailable", !available);
    button.setAttribute("aria-disabled", String(!available));
    button.title = available ? `Continue with ${button.dataset.provider}` : `${button.dataset.provider} sign-in requires provider configuration`;
  });
  const anyAvailable = socialProviders.google || socialProviders.apple;
  $("#socialStatus").hidden = anyAvailable;
  $("#socialStatus").textContent = anyAvailable ? "" : "Google and Apple sign-in are awaiting provider credentials.";
}

function startSocialLogin(provider) {
  if (!socialProviders[provider.toLowerCase()]) {
    showToast(`${provider} sign-in is not configured yet.`);
    return;
  }
  window.location.assign(`/api/auth/external/${provider.toLowerCase()}`);
}

function bindEvents() {
  $$("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
  $("#fillDemo").addEventListener("click", fillDemoAccount);
  $("#passwordToggle").addEventListener("click", togglePassword);
  $("#passwordInput").addEventListener("input", updatePasswordRequirements);
  $("#usernameInput").addEventListener("input", () => showFormError(""));
  $("#authForm").addEventListener("submit", handleAuth);
  $("#forgotPassword").addEventListener("click", () => showToast("Password reset is coming in the connected backend."));
  $$("[data-provider]").forEach((button) => button.addEventListener("click", () => startSocialLogin(button.dataset.provider)));
  $("#logoutButton").addEventListener("click", logout);
  $$("[data-page]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
  $$("[data-open-upload]").forEach((button) => button.addEventListener("click", openUploadModal));
  $$("[data-close-modal]").forEach((button) => button.addEventListener("click", closeUploadModal));
  $("#uploadModal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeUploadModal(); });
  $("#chooseDishImages").addEventListener("click", () => $("#dishImage").click());
  $("#addMorePhotos").addEventListener("click", () => $("#dishImage").click());
  $("#dishImage").addEventListener("change", previewDishImages);
  $("#dishCuisine").addEventListener("change", renderDishCategoryOptions);
  $("#addTimelineStep").addEventListener("click", () => addTimelineStep());
  $("#uploadForm").addEventListener("submit", createPost);
  $("#chooseStoryImage").addEventListener("click", () => $("#storyImageInput").click());
  $("#storyImageInput").addEventListener("change", previewStoryImage);
  $("#storyCaption").addEventListener("input", () => $("#storyCaptionCount").textContent = $("#storyCaption").value.length);
  $("#createStoryForm").addEventListener("submit", createStory);
  $$("[data-close-story-create]").forEach((button) => button.addEventListener("click", closeCreateStory));
  $("#createStoryModal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeCreateStory(); });
  $$("[data-close-story-viewer]").forEach((button) => button.addEventListener("click", closeStoryViewer));
  $("#storyViewer").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeStoryViewer(); });
  $("#previousStory").addEventListener("click", () => changeStory(-1));
  $("#nextStory").addEventListener("click", () => changeStory(1));
  $("#storyCommentForm").addEventListener("submit", submitStoryComment);
  $("#storyCommentInput").addEventListener("focus", pauseStoryTimer);
  $("#storyCommentInput").addEventListener("blur", scheduleStoryAdvance);
  $(".story-discussion").addEventListener("mouseenter", pauseStoryTimer);
  $(".story-discussion").addEventListener("mouseleave", scheduleStoryAdvance);
  $$('[data-edit-profile]').forEach((button) => button.addEventListener("click", openProfileEditor));
  $$('[data-close-profile-editor]').forEach((button) => button.addEventListener("click", closeProfileEditor));
  $("#editProfileModal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeProfileEditor(); });
  $("#avatarImageInput").addEventListener("change", (event) => previewProfileMedia(event, "avatar"));
  $("#coverImageInput").addEventListener("change", (event) => previewProfileMedia(event, "cover"));
  $("#editBio").addEventListener("input", updateBioCount);
  $("#editProfileForm").addEventListener("submit", saveProfile);
  $("#newMessageButton").addEventListener("click", () => showToast("Choose a cook from Discover to start a new conversation."));
  $$("[data-notifications]").forEach((button) => button.addEventListener("click", openNotifications));
  $("[data-close-notifications]").addEventListener("click", closeNotifications);
  $("#notificationBackdrop").addEventListener("click", closeNotifications);
  $("#discoverSearch").addEventListener("input", scheduleSearch);
  $$("[data-close-public-profile]").forEach((button) => button.addEventListener("click", closePublicProfile));
  $("#publicProfileModal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closePublicProfile(); });
  $("#publicProfileFollow").addEventListener("click", () => {
    const button = $("#publicProfileFollow");
    const following = button.classList.toggle("following");
    button.textContent = following ? "Following" : "Follow";
  });
  $("#accountSettingsForm").addEventListener("submit", saveAccountSettings);
  $("#passwordSettingsForm").addEventListener("submit", changeAccountPassword);
  $("#settingsPrivateProfile").addEventListener("change", updateAccountPrivacy);
  $$("[data-theme-choice-setting]").forEach((button) => button.addEventListener("click", () => setThemePreference(button.dataset.themeChoiceSetting)));
  $$("[data-notification-setting]").forEach((input) => input.addEventListener("change", saveNotificationSettings));
  $$("[data-settings-target]").forEach((button) => button.addEventListener("click", () => scrollToSettingsSection(button)));
  $("#settingsLogout").addEventListener("click", logout);
  $("[data-close-message-media]").addEventListener("click", closeMessageMediaViewer);
  $("#messageMediaViewer").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeMessageMediaViewer(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem("dishcoverTheme") || "system") === "system") applyTheme("system");
  });
  $$(".feed-tabs button").forEach((button) => button.addEventListener("click", () => {
    $$(".feed-tabs button").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    renderFeed(button.dataset.feed);
  }));
  document.addEventListener("keydown", handleKeyboard);
  renderDishCategoryOptions();
  renderTimelineSteps();
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $$("[data-auth-mode]").forEach((button) => {
    const active = button.dataset.authMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active);
  });
  $("#signupFields").hidden = !signup;
  $("#demoCard").hidden = signup;
  $("#nameInput").required = signup;
  $("#usernameInput").required = signup;
  $("#passwordInput").autocomplete = signup ? "new-password" : "current-password";
  $("#passwordRequirements").hidden = !signup;
  $("#authTitle").textContent = signup ? "Create your food profile" : "Sign in to Dishcover";
  $("#authSubtitle").textContent = signup ? "Bring your recipes, stories, and appetite." : "Your next favorite dish is waiting.";
  $("#authSubmit span").textContent = signup ? "Create my account" : "Enter Dishcover";
  $("#forgotPassword").hidden = signup;
  updatePasswordRequirements();
  showFormError("");
}

function fillDemoAccount() {
  setAuthMode("login");
  $("#emailInput").value = TEST_ACCOUNT.email;
  $("#passwordInput").value = TEST_ACCOUNT.password;
  $("#passwordInput").focus();
  showToast("Test account filled in. Select Enter Dishcover.");
}

function togglePassword() {
  const input = $("#passwordInput");
  input.type = input.type === "password" ? "text" : "password";
  $("#passwordToggle").setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
}

function getPasswordRules(password) {
  return {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    special: /[^A-Za-z0-9]/.test(password)
  };
}

function isStrongPassword(password) {
  return Object.values(getPasswordRules(password)).every(Boolean);
}

function updatePasswordRequirements() {
  const rules = getPasswordRules($("#passwordInput").value);
  $$("[data-password-rule]").forEach((item) => item.classList.toggle("valid", rules[item.dataset.passwordRule]));
}

async function handleAuth(event) {
  event.preventDefault();
  const submit = $("#authSubmit");
  const email = $("#emailInput").value.trim().toLowerCase();
  const password = $("#passwordInput").value;
  showFormError("");

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return showFormError("Enter a valid email address.");
  if (authMode === "signup") {
    const username = $("#usernameInput").value.trim().replace(/^@/, "");
    if (username.includes("@")) return showFormError("Enter a username, not an email address. Example: foodlover");
    if (!/^[A-Za-z0-9._]{2,30}$/.test(username)) return showFormError("Username must contain 2-30 letters, numbers, periods, or underscores.");
    if (!isStrongPassword(password)) return showFormError("Password must have at least 8 characters, uppercase and lowercase letters, and a special character.");
  } else if (password.length < 8) {
    return showFormError("Your password must contain at least 8 characters.");
  }

  submit.disabled = true;
  submit.querySelector("span").textContent = authMode === "signup" ? "Creating account..." : "Opening your table...";
  try {
    if (authMode === "signup") await createAccount(email, password);
    else await signIn(email, password);
    await showApp();
  } catch (error) {
    showFormError(error.message);
  } finally {
    submit.disabled = false;
    submit.querySelector("span").textContent = authMode === "signup" ? "Create my account" : "Enter Dishcover";
  }
}

async function signIn(email, password) {
  currentUser = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, remember: $("#rememberInput").checked })
  });
}

async function createAccount(email, password) {
  const name = $("#nameInput").value.trim();
  const rawUsername = $("#usernameInput").value.trim().replace(/^@/, "");
  if (name.length < 2) throw new Error("Enter your full name to continue.");
  if (!/^[A-Za-z0-9._]{2,30}$/.test(rawUsername)) throw new Error("Username must contain 2-30 letters, numbers, periods, or underscores.");
  currentUser = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name,
      username: rawUsername,
      email,
      password,
      accountType: $("input[name='accountType']:checked").value
    })
  });
}

async function showApp() {
  await loadAppData();
  $("#authView").hidden = true;
  $("#appView").hidden = false;
  document.body.classList.add("is-authenticated");
  hydrateUser();
  renderAll();
  navigate("home");
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch (error) {
    console.error(error);
  }
  currentUser = null;
  posts = [];
  conversations = [];
  stories = [];
  searchResults = null;
  $("#discoverSearch").value = "";
  $("#appView").hidden = true;
  $("#authView").hidden = false;
  document.body.classList.remove("is-authenticated");
  $("#authForm").reset();
  setAuthMode("login");
  showToast("Signed out successfully.");
}

function hydrateUser() {
  $$('[data-current-avatar]').forEach((image) => image.src = currentUser.avatar);
  $$('[data-current-name]').forEach((element) => element.textContent = currentUser.name);
  $$('[data-current-username]').forEach((element) => element.textContent = currentUser.username);
  $$('[data-current-first-name]').forEach((element) => element.textContent = currentUser.name.split(" ")[0]);
  $("#profileBio").textContent = currentUser.bio || "Sharing food stories, one dish at a time.";
  $("#profileLocation").textContent = currentUser.location || "Philippines";
  $("#profileAge").textContent = currentUser.age ? `${currentUser.age} years old` : "";
  $("#profileAge").hidden = !currentUser.age;
  const website = $("#profileWebsite");
  website.hidden = !currentUser.website;
  website.href = currentUser.website || "#";
  website.textContent = currentUser.website ? currentUser.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
  $("#profileCover").style.backgroundImage = `linear-gradient(90deg, rgba(35,55,42,.2), rgba(35,55,42,.05)), url("${currentUser.cover || TEST_ACCOUNT.cover}")`;
  const hour = new Date().getHours();
  $("#greeting").textContent = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  hydrateSettings();
}

function hydrateSettings() {
  if (!currentUser) return;
  $("#settingsName").value = currentUser.name || "";
  $("#settingsUsername").value = (currentUser.username || "").replace(/^@/, "");
  $("#settingsEmail").value = currentUser.email || "";
  $("#settingsAccountType").textContent = currentUser.accountType === "restaurant" ? "Food business" : "Food lover";
  $("#settingsPrivateProfile").checked = Boolean(currentUser.isPrivate);
  const theme = localStorage.getItem("dishcoverTheme") || "system";
  $$("[data-theme-choice-setting]").forEach((button) => button.classList.toggle("active", button.dataset.themeChoiceSetting === theme));
  const defaults = { social: true, followers: true, messages: true };
  let preferences = defaults;
  try {
    preferences = { ...defaults, ...JSON.parse(localStorage.getItem("dishcoverNotifications") || "{}") };
  } catch {
    preferences = defaults;
  }
  $$("[data-notification-setting]").forEach((input) => input.checked = preferences[input.dataset.notificationSetting] !== false);
}

async function saveAccountSettings(event) {
  event.preventDefault();
  const error = $("#accountSettingsError");
  const button = event.submitter || $("button[type='submit']", event.currentTarget);
  error.textContent = "";
  button.disabled = true;
  const oldUsername = currentUser.username;
  try {
    currentUser = await api("/api/account", {
      method: "PUT",
      body: JSON.stringify({
        name: $("#settingsName").value.trim(),
        username: $("#settingsUsername").value.trim(),
        email: $("#settingsEmail").value.trim()
      })
    });
    posts.filter((post) => post.creator.id === currentUser.id || post.creator.username === oldUsername).forEach((post) => {
      post.creator = { ...post.creator, name: currentUser.name, username: currentUser.username };
    });
    stories.filter((story) => story.creator.id === currentUser.id).forEach((story) => {
      story.creator = { ...story.creator, name: currentUser.name, username: currentUser.username };
    });
    hydrateUser();
    renderStories();
    renderFeed();
    renderProfile();
    showToast("Account details updated.");
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    button.disabled = false;
  }
}

async function changeAccountPassword(event) {
  event.preventDefault();
  const error = $("#passwordSettingsError");
  const button = event.submitter || $("button[type='submit']", event.currentTarget);
  const currentPassword = $("#currentPassword").value;
  const newPassword = $("#newPassword").value;
  const confirmation = $("#confirmPassword").value;
  error.textContent = "";
  if (newPassword !== confirmation) return error.textContent = "The new passwords do not match.";
  if (!isStrongPassword(newPassword)) return error.textContent = "Your new password needs at least 8 characters, uppercase and lowercase letters, and a special character.";
  button.disabled = true;
  try {
    await api("/api/account/password", {
      method: "PUT",
      body: JSON.stringify({ currentPassword, newPassword })
    });
    $("#passwordSettingsForm").reset();
    showToast("Password updated successfully.");
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    button.disabled = false;
  }
}

async function updateAccountPrivacy(event) {
  const input = event.currentTarget;
  const previous = currentUser.isPrivate;
  try {
    currentUser = await api("/api/account/privacy", {
      method: "PUT",
      body: JSON.stringify({ isPrivate: input.checked })
    });
    showToast(input.checked ? "Your profile is now private." : "Your profile is now public.");
  } catch (error) {
    input.checked = previous;
    showToast(error.message);
  }
}

function setThemePreference(preference) {
  localStorage.setItem("dishcoverTheme", preference);
  applyTheme(preference);
  $$("[data-theme-choice-setting]").forEach((button) => button.classList.toggle("active", button.dataset.themeChoiceSetting === preference));
  showToast(`${preference[0].toUpperCase()}${preference.slice(1)} appearance selected.`);
}

function applyTheme(preference) {
  const dark = preference === "dark" || (preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function saveNotificationSettings() {
  const settings = {};
  $$("[data-notification-setting]").forEach((input) => settings[input.dataset.notificationSetting] = input.checked);
  localStorage.setItem("dishcoverNotifications", JSON.stringify(settings));
  showToast("Notification preferences saved.");
}

function scrollToSettingsSection(button) {
  $$("[data-settings-target]").forEach((item) => item.classList.toggle("active", item === button));
  $(`#${button.dataset.settingsTarget}`).scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderAll() {
  renderStories();
  renderFeed();
  renderTrending();
  renderCreators();
  renderCuisineFilters();
  renderDiscover();
  renderChats();
  renderProfile();
  renderNotifications();
}

function renderStories() {
  const orderedStories = [...stories].sort((a, b) => Number(b.creator.id === currentUser.id) - Number(a.creator.id === currentUser.id));
  $("#stories").innerHTML = `<button class="story add-story" type="button" data-create-story><span class="story-image">${icon("plus")}</span><span>Add story</span></button>${orderedStories.map((story) => {
    const own = story.creator.id === currentUser.id;
    return `<button class="story ${own ? "own-story" : ""}" type="button" data-story-id="${story.id}"><span class="story-image"><img src="${escapeHtml(story.creator.avatar)}" alt="${escapeHtml(story.creator.name)}" /></span><span>${own ? "Your story" : escapeHtml(firstName(story.creator.name))}</span></button>`;
  }).join("")}`;
  $("[data-create-story]").addEventListener("click", openCreateStory);
  $$("[data-story-id]").forEach((button) => button.addEventListener("click", () => openStory(button.dataset.storyId)));
}

function openCreateStory() {
  $("#storyCreateError").textContent = "";
  $("#createStoryModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeCreateStory() {
  $("#createStoryModal").hidden = true;
  document.body.style.overflow = "";
}

async function previewStoryImage(event) {
  const [file] = event.target.files;
  if (!file) return;
  try {
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
    pendingStoryMedia = await resizeImage(file, 1080, 1920);
    $("#storyImagePreview").src = pendingStoryMedia;
    $("#storyImagePreview").hidden = false;
    $("#storyCreateError").textContent = "";
  } catch (error) {
    $("#storyCreateError").textContent = error.message;
  } finally {
    event.target.value = "";
  }
}

async function createStory(event) {
  event.preventDefault();
  const button = $("#shareStoryButton");
  const error = $("#storyCreateError");
  if (!pendingStoryMedia) return error.textContent = "Add a photo before sharing your story.";
  button.disabled = true;
  button.querySelector("span").textContent = "Sharing...";
  try {
    const story = await api("/api/stories", {
      method: "POST",
      body: JSON.stringify({ media: pendingStoryMedia, caption: $("#storyCaption").value.trim() })
    });
    stories.unshift(story);
    pendingStoryMedia = "";
    $("#createStoryForm").reset();
    $("#storyImagePreview").hidden = true;
    $("#storyImagePreview").removeAttribute("src");
    $("#storyCaptionCount").textContent = "0";
    closeCreateStory();
    renderStories();
    openStory(story.id);
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Share story";
  }
}

function openStory(storyId) {
  activeStoryIndex = stories.findIndex((story) => story.id === storyId);
  if (activeStoryIndex < 0) return;
  $("#storyViewer").hidden = false;
  document.body.style.overflow = "hidden";
  renderActiveStory();
}

function closeStoryViewer() {
  pauseStoryTimer();
  activeStoryIndex = -1;
  $("#storyViewer").hidden = true;
  document.body.style.overflow = "";
  $("#storyCommentInput").value = "";
}

async function renderActiveStory() {
  pauseStoryTimer();
  const story = stories[activeStoryIndex];
  if (!story) return closeStoryViewer();
  $("#storyProgress").innerHTML = stories.map((_, index) => `<span class="${index < activeStoryIndex ? "complete" : index === activeStoryIndex ? "active" : ""}"><i></i></span>`).join("");
  $("#storyCreatorAvatar").src = story.creator.avatar;
  $("#storyCreatorName").textContent = story.creator.id === currentUser.id ? "Your story" : story.creator.name;
  $("#storyCreatedAt").textContent = relativeTime(story.createdAt);
  $("#storyViewerMedia").src = story.media;
  $("#storyViewerMedia").alt = `${story.creator.name}'s story`;
  $("#storyViewerCaption").textContent = story.caption;
  $("#storyViewerCaption").hidden = !story.caption;
  renderStoryReactions();
  $("#storyComments").innerHTML = `<p class="story-comments-empty">Loading comments...</p>`;
  try {
    const comments = await api(`/api/stories/${encodeURIComponent(story.id)}/comments`);
    if (stories[activeStoryIndex]?.id === story.id) renderStoryComments(comments);
  } catch (error) {
    $("#storyComments").innerHTML = `<p class="story-comments-empty">Comments could not be loaded.</p>`;
  }
  scheduleStoryAdvance();
}

function changeStory(direction, automatic = false) {
  pauseStoryTimer();
  const nextIndex = activeStoryIndex + direction;
  if (automatic && nextIndex >= stories.length) return closeStoryViewer();
  activeStoryIndex = (nextIndex + stories.length) % stories.length;
  renderActiveStory();
}

function scheduleStoryAdvance() {
  pauseStoryTimer();
  if ($("#storyViewer").hidden || activeStoryIndex < 0 || document.activeElement === $("#storyCommentInput")) return;
  storyTimer = setTimeout(() => changeStory(1, true), 6000);
}

function pauseStoryTimer() {
  clearTimeout(storyTimer);
}

function renderStoryReactions() {
  const story = stories[activeStoryIndex];
  $("#storyReactions").innerHTML = MESSAGE_REACTIONS.slice(0, 5).map((reaction) => `<button type="button" class="${story.userReaction === reaction ? "active" : ""}" data-story-reaction="${reaction}" aria-label="React ${reaction}">${reaction}</button>`).join("") + `<span class="story-reaction-count">${story.reactionCount || 0} reactions</span>`;
  $$("[data-story-reaction]").forEach((button) => button.addEventListener("click", () => reactToStory(button.dataset.storyReaction)));
}

async function reactToStory(reaction) {
  const story = stories[activeStoryIndex];
  if (!story) return;
  pauseStoryTimer();
  const previous = story.userReaction;
  try {
    await api(`/api/stories/${encodeURIComponent(story.id)}/reaction`, {
      method: "PATCH",
      body: JSON.stringify({ reaction })
    });
    story.userReaction = previous === reaction ? null : reaction;
    if (!previous && story.userReaction) story.reactionCount += 1;
    if (previous && !story.userReaction) story.reactionCount = Math.max(0, story.reactionCount - 1);
    renderStoryReactions();
  } catch (error) {
    showToast(error.message);
  }
  scheduleStoryAdvance();
}

function renderStoryComments(comments) {
  $("#storyComments").innerHTML = comments.length ? comments.map((comment) => `<article class="story-comment"><img src="${escapeHtml(comment.authorAvatar)}" alt="" /><div><strong>${escapeHtml(comment.authorName)}</strong><p>${escapeHtml(comment.text)}</p><time>${relativeTime(comment.createdAt)}</time></div></article>`).join("") : `<p class="story-comments-empty">No comments yet.<br />Start the conversation.</p>`;
  const container = $("#storyComments");
  container.scrollTop = container.scrollHeight;
}

async function submitStoryComment(event) {
  event.preventDefault();
  const story = stories[activeStoryIndex];
  const input = $("#storyCommentInput");
  const text = input.value.trim();
  if (!story || !text) return;
  try {
    const comment = await api(`/api/stories/${encodeURIComponent(story.id)}/comments`, {
      method: "POST",
      body: JSON.stringify({ text })
    });
    input.value = "";
    story.commentCount += 1;
    const comments = await api(`/api/stories/${encodeURIComponent(story.id)}/comments`);
    renderStoryComments(comments);
    showToast("Comment added to the story.");
  } catch (error) {
    showToast(error.message);
  }
  input.focus();
}

function renderFeed(filter = "foryou") {
  let visiblePosts = posts;
  if (filter === "following") visiblePosts = posts.filter((_, index) => index % 2 === 0);
  if (filter === "nearby") visiblePosts = posts.filter((post) => ["Filipino", "Dessert"].includes(post.cuisine));
  $("#postFeed").innerHTML = visiblePosts.slice(0, 4).map(postCard).join("");
  bindPostActions($("#postFeed"));
}

function postCard(post) {
  const liked = localStorage.getItem(`liked-${post.id}`) === "true";
  const saved = localStorage.getItem(`saved-${post.id}`) === "true";
  const images = post.images?.length ? post.images : [post.image];
  const timeline = post.timeline || [];
  return `<article class="post-card" data-post-id="${post.id}">
    <header class="post-head">
      <img class="post-avatar" src="${post.creator.avatar}" alt="${escapeHtml(post.creator.name)}" />
      <div class="post-author"><strong>${escapeHtml(post.creator.name)}</strong><span>${escapeHtml(post.creator.username)} · ${escapeHtml(post.age || "Just now")}</span></div>
      <button type="button" aria-label="More options">${icon("more")}</button>
    </header>
    <div class="post-media" data-post-detail data-carousel-index="0">
      <img data-carousel-image src="${images[0]}" alt="${escapeHtml(post.title)} photo 1" />
      <div class="post-tags"><span>${escapeHtml(post.meal || "Dish")}</span></div>
      ${images.length > 1 ? `<button type="button" class="carousel-button previous" data-carousel-previous aria-label="Previous photo">${icon("arrow")}</button><button type="button" class="carousel-button next" data-carousel-next aria-label="Next photo">${icon("arrow")}</button><span class="photo-indicator" data-photo-indicator>1 / ${images.length}</span><span class="carousel-dots">${images.map((_, index) => `<i class="${index === 0 ? "active" : ""}"></i>`).join("")}</span>` : ""}
      <span class="post-time">${icon("clock")}${escapeHtml(post.time || "30 min")}</span>
    </div>
    <div class="post-taxonomy"><span>${escapeHtml(post.cuisine)}</span><span>${escapeHtml(post.category || "Specialty")}</span></div>
    <div class="post-body">
      <div class="post-title-row"><h2>${escapeHtml(post.title)}</h2><div class="post-actions">
        <button class="${liked ? "active" : ""}" type="button" data-like aria-label="Like">${icon("heart")}<span>${formatCount(post.likes + (liked ? 1 : 0))}</span></button>
        <button type="button" data-comment aria-label="Comment">${icon("comment")}<span>${post.comments}</span></button>
        <button type="button" data-share aria-label="Share">${icon("share")}</button>
        <button class="${saved ? "active" : ""}" type="button" data-save aria-label="Save">${icon("bookmark")}</button>
      </div></div>
      <p class="post-caption">${escapeHtml(post.caption)}</p>
      ${(post.ingredients || []).length ? `<div class="ingredient-row"><span>Made with</span>${post.ingredients.map((item) => `<span class="ingredient-chip">${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      ${timeline.length ? `<details class="post-timeline"><summary>${icon("clock")}Cooking timeline · ${timeline.length} ${timeline.length === 1 ? "step" : "steps"}</summary><div class="mini-timeline">${timeline.map((step) => `<div class="mini-timeline-step"><time>${step.minute} min</time><div><strong>${escapeHtml(step.instruction)}</strong>${step.ingredients ? `<span>Add: ${escapeHtml(step.ingredients)}</span>` : ""}</div></div>`).join("")}</div></details>` : ""}
    </div>
  </article>`;
}

function bindPostActions(context) {
  $$('[data-like]', context).forEach((button) => button.addEventListener("click", () => {
    const postId = button.closest("[data-post-id]").dataset.postId;
    const post = posts.find((item) => item.id === postId);
    const active = button.classList.toggle("active");
    localStorage.setItem(`liked-${postId}`, active);
    button.querySelector("span").textContent = formatCount(post.likes + (active ? 1 : 0));
  }));
  $$('[data-save]', context).forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const postId = button.closest("[data-post-id]").dataset.postId;
    const active = button.classList.toggle("active");
    localStorage.setItem(`saved-${postId}`, active);
    showToast(active ? "Dish saved to your kitchen." : "Dish removed from saved items.");
  }));
  $$('[data-share]', context).forEach((button) => button.addEventListener("click", () => showToast("Share link copied to your clipboard.")));
  $$('[data-comment]', context).forEach((button) => button.addEventListener("click", () => showToast("Comments will open in the dish detail screen.")));
  $$('[data-post-detail]', context).forEach((media) => media.addEventListener("click", () => showToast("Dish detail with ingredients and cooking flow is next.")));
  $$('[data-carousel-previous], [data-carousel-next]', context).forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    changeCarouselPhoto(button, button.hasAttribute("data-carousel-next") ? 1 : -1);
  }));
}

function changeCarouselPhoto(button, direction) {
  const card = button.closest("[data-post-id]");
  const media = button.closest(".post-media");
  const post = posts.find((item) => item.id === card.dataset.postId);
  const images = post?.images?.length ? post.images : [post?.image];
  if (!post || images.length < 2) return;
  const index = (Number(media.dataset.carouselIndex) + direction + images.length) % images.length;
  media.dataset.carouselIndex = index;
  const image = $("[data-carousel-image]", media);
  image.src = images[index];
  image.alt = `${post.title} photo ${index + 1}`;
  $("[data-photo-indicator]", media).textContent = `${index + 1} / ${images.length}`;
  $$(".carousel-dots i", media).forEach((dot, dotIndex) => dot.classList.toggle("active", dotIndex === index));
}

function renderTrending() {
  $("#trendingList").innerHTML = posts.slice(1, 4).map((post, index) => `<div class="trend-item" data-page="discover"><img src="${post.image}" alt="" /><div><strong>${escapeHtml(post.title)}</strong><span>${escapeHtml(post.cuisine)} · ${formatCount(post.likes)} saves</span></div><b>#${index + 1}</b></div>`).join("");
  $$(".trend-item").forEach((item) => item.addEventListener("click", () => navigate("discover")));
}

function renderCreators() {
  $("#creatorList").innerHTML = creators.slice(0, 3).map((creator) => `<div class="creator"><img src="${creator.avatar}" alt="${escapeHtml(creator.name)}" /><div><strong>${escapeHtml(creator.name)}</strong><span>${escapeHtml(creator.specialty)}</span></div><button class="follow-button" type="button">Follow</button></div>`).join("");
  $$(".follow-button").forEach((button) => button.addEventListener("click", () => {
    const following = button.classList.toggle("following");
    button.textContent = following ? "Following" : "Follow";
  }));
}

function renderCuisineFilters() {
  const cuisines = ["All", ...Object.keys(DISH_CATEGORIES)];
  $("#cuisineFilters").innerHTML = cuisines.map((cuisine) => `<button type="button" class="filter-chip ${cuisine === activeCuisine ? "active" : ""}" data-cuisine="${cuisine}">${cuisine}</button>`).join("");
  $$("[data-cuisine]").forEach((button) => button.addEventListener("click", () => {
    activeCuisine = button.dataset.cuisine;
    activeSubcategory = "All";
    renderCuisineFilters();
    renderDiscover();
  }));
  renderSubcategoryFilters();
}

function renderSubcategoryFilters() {
  const categories = activeCuisine === "All"
    ? ["All", ...new Set(Object.values(DISH_CATEGORIES).flat())]
    : ["All", ...(DISH_CATEGORIES[activeCuisine] || [])];
  $("#subcategoryFilters").innerHTML = categories.map((category) => `<button type="button" class="subcategory-chip ${category === activeSubcategory ? "active" : ""}" data-subcategory="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
  $$("[data-subcategory]").forEach((button) => button.addEventListener("click", () => {
    activeSubcategory = button.dataset.subcategory;
    renderSubcategoryFilters();
    renderDiscover();
  }));
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchRequest?.abort();
  const query = $("#discoverSearch").value.trim();
  if (!query) {
    searchResults = null;
    renderDiscover();
    return;
  }
  searchResults = null;
  $("#dishResultEyebrow").textContent = "Searching Dishcover";
  $("#dishResultTitle").textContent = `Looking for “${query}”`;
  $("#resultCount").textContent = "";
  $("#dishGrid").innerHTML = `<div class="search-empty">${icon("search")}<strong>Searching...</strong><span>Checking dishes, ingredients, and creators.</span></div>`;
  searchTimer = setTimeout(() => performSearch(query), 280);
}

async function performSearch(query) {
  searchRequest = new AbortController();
  try {
    const result = await api(`/api/search?query=${encodeURIComponent(query)}`, { signal: searchRequest.signal });
    if ($("#discoverSearch").value.trim() !== query) return;
    searchResults = result;
    renderDiscover();
  } catch (error) {
    if (error.name === "AbortError") return;
    $("#dishGrid").innerHTML = `<div class="search-empty">${icon("search")}<strong>Search is unavailable</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function renderDiscover() {
  const query = $("#discoverSearch").value.trim().toLowerCase();
  if (query && !searchResults) return;
  const sourcePosts = query && searchResults ? searchResults.posts : posts;
  const filtered = sourcePosts.filter((post) => {
    const matchesCuisine = activeCuisine === "All" || post.cuisine === activeCuisine;
    const matchesSubcategory = activeSubcategory === "All" || post.category === activeSubcategory;
    return matchesCuisine && matchesSubcategory;
  });
  const profiles = query && searchResults ? searchResults.profiles : [];
  $("#profileSearchSection").hidden = profiles.length === 0;
  $("#profileResultCount").textContent = `${profiles.length} ${profiles.length === 1 ? "profile" : "profiles"}`;
  $("#profileSearchResults").innerHTML = profiles.map((profile) => `<button type="button" class="profile-search-card" data-search-profile="${escapeHtml(profile.id)}"><img src="${escapeHtml(profile.avatar)}" alt="${escapeHtml(profile.name)}" /><span><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(profile.username)} · ${profile.dishCount} dishes</small></span><b>View</b></button>`).join("");
  $$("[data-search-profile]").forEach((button) => button.addEventListener("click", () => openPublicProfile(button.dataset.searchProfile)));
  $("#dishResultEyebrow").textContent = query ? "Food and dish posts" : "Handpicked for you";
  $("#dishResultTitle").textContent = query ? `Results for “${$("#discoverSearch").value.trim()}”` : "Popular this week";
  $("#resultCount").textContent = `${filtered.length} ${filtered.length === 1 ? "dish" : "dishes"}`;
  $("#dishGrid").innerHTML = filtered.length ? filtered.map((post) => `<article class="dish-tile" data-post-id="${post.id}"><img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" /><button class="tile-save ${localStorage.getItem(`saved-${post.id}`) === "true" ? "active" : ""}" type="button" data-save aria-label="Save dish">${icon("bookmark")}</button><div class="tile-copy"><span>${escapeHtml(post.cuisine)} · ${escapeHtml(post.category || "Specialty")}</span><h3>${escapeHtml(post.title)}</h3><p>by ${escapeHtml(post.creator.name)}</p></div></article>`).join("") : `<div class="search-empty">${icon("search")}<strong>No dishes found</strong><span>Try another food, ingredient, cuisine, or creator.</span></div>`;
  bindPostActions($("#dishGrid"));
}

function openPublicProfile(profileId) {
  const profile = searchResults?.profiles.find((item) => item.id === profileId);
  if (!profile) return;
  $("#publicProfileName").textContent = profile.name;
  $("#publicProfileUsername").textContent = profile.username;
  $("#publicProfileAvatar").src = profile.avatar;
  $("#publicProfileAvatar").alt = profile.name;
  $("#publicProfileBio").textContent = profile.bio || "Sharing food stories on Dishcover.";
  $("#publicProfileLocation").textContent = profile.location || "Dishcover community";
  $("#publicProfileDishCount").textContent = profile.dishCount;
  $("#publicProfileFollow").classList.remove("following");
  $("#publicProfileFollow").textContent = "Follow";
  const profilePosts = posts.filter((post) => post.creator.username.toLowerCase() === profile.username.toLowerCase());
  $("#publicProfileDishes").innerHTML = profilePosts.length ? profilePosts.slice(0, 6).map((post) => `<img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" />`).join("") : `<div class="search-empty"><strong>No dishes yet</strong><span>This cook has not shared a dish.</span></div>`;
  $("#publicProfileModal").hidden = false;
  document.body.style.overflow = "hidden";
}

function closePublicProfile() {
  $("#publicProfileModal").hidden = true;
  document.body.style.overflow = "";
}

function renderChats() {
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  if (!activeConversationId && sorted.length) activeConversationId = sorted[0].id;
  $("#chatList").innerHTML = sorted.map((chat) => `<button type="button" class="chat-item ${chat.id === activeConversationId ? "active" : ""}" data-chat="${chat.id}">
    <span class="chat-avatar"><img src="${chat.participant.avatar}" alt="${escapeHtml(chat.participant.name)}" /><i></i></span>
    <span class="chat-preview"><strong>${escapeHtml(chat.nickname || chat.participant.name)}</strong><span>${escapeHtml(chat.preview)}</span></span>
    <span class="chat-meta"><time>${escapeHtml(chat.time)}</time>${chat.unread ? `<i>${chat.unread}</i>` : ""}</span>
  </button>`).join("");
  $$("[data-chat]").forEach((button) => button.addEventListener("click", () => selectConversation(button.dataset.chat)));
  renderConversation(activeConversationId);
}

async function selectConversation(conversationId) {
  activeConversationId = conversationId;
  pendingMessagePhoto = "";
  const conversation = conversations.find((item) => item.id === conversationId);
  if (conversation?.unread) {
    conversation.unread = 0;
  }
  renderChats();
}

async function renderConversation(conversationId) {
  const chat = conversations.find((item) => item.id === conversationId);
  if (!chat) return;
  const messages = await api(`/api/conversations/${encodeURIComponent(chat.id)}/messages`);
  if (conversationId !== activeConversationId) return;
  const theme = CHAT_THEMES[chat.theme] || CHAT_THEMES.sage;
  const displayName = chat.nickname || chat.participant.name;
  const conversation = $("#conversation");
  conversation.style.setProperty("--chat-accent", theme.accent);
  conversation.style.setProperty("--chat-soft", theme.soft);
  conversation.style.setProperty("--chat-canvas", theme.canvas);
  conversation.innerHTML = `
    <header class="conversation-head">
      <span class="conversation-person"><span class="chat-avatar large"><img src="${chat.participant.avatar}" alt="${escapeHtml(chat.participant.name)}" /><i></i></span><span><strong>${escapeHtml(displayName)}</strong><small>${chat.nickname ? escapeHtml(chat.participant.name) + " · " : ""}Active now</small></span></span>
      <div class="conversation-tools">
        <button type="button" class="theme-button" data-toggle-theme><i style="background:${theme.accent}"></i>${icon("settings")}<span>Customize</span></button>
        <button type="button" class="conversation-icon-button" data-chat-info aria-label="Conversation information">${icon("more")}</button>
      </div>
      <div class="theme-popover" id="themePopover" hidden>
        <div class="customize-chat-heading"><strong>Customize chat</strong><span>Make this conversation feel like yours.</span></div>
        <label class="customize-nickname"><span>Nickname</span><input id="conversationNickname" maxlength="50" value="${escapeHtml(chat.nickname || "")}" placeholder="${escapeHtml(chat.participant.name)}" /></label>
        <div class="customize-section"><span>Color theme</span><div class="theme-options">${Object.entries(CHAT_THEMES).map(([key, option]) => `<button type="button" class="theme-option ${chat.theme === key ? "active" : ""}" data-conversation-theme="${key}" title="${option.name}"><i style="--theme-color:${option.accent};--theme-soft:${option.soft}"></i>${chat.theme === key ? icon("check") : ""}</button>`).join("")}</div></div>
        <div class="customize-section"><span>Default quick emoji</span><div class="default-emoji-options">${CHAT_EMOJIS.map((emoji) => `<button type="button" class="${chat.defaultEmoji === emoji ? "active" : ""}" data-default-emoji="${emoji}">${emoji}</button>`).join("")}</div></div>
        <button class="save-chat-settings" type="button" data-save-chat-settings>Save changes</button>
      </div>
    </header>
    <div class="conversation-body">
      <span class="message-time">Today</span>
      ${messages.map((message, index) => messageMarkup(message, chat, index === messages.length - 1)).join("")}
    </div>
    <form class="message-compose">
      <input type="file" id="messagePhotoInput" accept="image/png,image/jpeg,image/webp" hidden />
      <div class="message-photo-preview" id="messagePhotoPreview" hidden><img id="messagePhotoPreviewImage" src="" alt="Photo ready to send" /><button type="button" data-remove-message-photo aria-label="Remove photo">${icon("x")}</button></div>
      <button type="button" class="compose-icon" data-attach aria-label="Attach a photo">${icon("paperclip")}</button>
      <button type="button" class="compose-icon" data-add-emoji aria-label="Add an emoji">${icon("smile")}</button>
      <input data-message-input aria-label="Message" maxlength="500" autocomplete="off" placeholder="Message ${escapeHtml(firstName(displayName))}..." />
      <div class="composer-emoji-picker" id="composerEmojiPicker" hidden>${CHAT_EMOJIS.map((emoji) => `<button type="button" data-composer-emoji="${emoji}">${emoji}</button>`).join("")}</div>
      <button type="button" class="quick-reply" data-quick-reply aria-label="Send default emoji">${chat.defaultEmoji || "❤️"}</button>
      <button type="submit" class="send-button" aria-label="Send message">${icon("send")}</button>
    </form>`;

  $("[data-toggle-theme]", conversation).addEventListener("click", (event) => {
    event.stopPropagation();
    $("#themePopover").hidden = !$("#themePopover").hidden;
  });
  $$("[data-conversation-theme]", conversation).forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    $$("[data-conversation-theme]", conversation).forEach((item) => item.classList.toggle("active", item === button));
    $("#themePopover").dataset.selectedTheme = button.dataset.conversationTheme;
  }));
  $$("[data-default-emoji]", conversation).forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    $$("[data-default-emoji]", conversation).forEach((item) => item.classList.toggle("active", item === button));
    $("#themePopover").dataset.selectedEmoji = button.dataset.defaultEmoji;
  }));
  $("[data-save-chat-settings]", conversation).addEventListener("click", (event) => {
    event.stopPropagation();
    saveConversationCustomization();
  });
  $("[data-chat-info]", conversation).addEventListener("click", () => showToast("Conversation details and media are coming next."));
  $("[data-attach]", conversation).addEventListener("click", () => $("#messagePhotoInput").click());
  $("#messagePhotoInput").addEventListener("change", previewMessagePhoto);
  $("[data-remove-message-photo]").addEventListener("click", clearMessagePhoto);
  $("[data-add-emoji]", conversation).addEventListener("click", (event) => {
    event.stopPropagation();
    $("#composerEmojiPicker").hidden = !$("#composerEmojiPicker").hidden;
  });
  $$("[data-composer-emoji]", conversation).forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const input = $("[data-message-input]", conversation);
    input.value += button.dataset.composerEmoji;
    input.focus();
    $("#composerEmojiPicker").hidden = true;
  }));
  $("[data-quick-reply]", conversation).addEventListener("click", () => sendMessage(chat.defaultEmoji || "❤️"));
  $$("[data-open-reactions]", conversation).forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const picker = button.closest(".message-cluster").querySelector(".reaction-picker");
    $$(".reaction-picker", conversation).forEach((item) => { if (item !== picker) item.hidden = true; });
    picker.hidden = !picker.hidden;
  }));
  $$("[data-reaction]", conversation).forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    reactToMessage(button.closest("[data-message-id]").dataset.messageId, button.dataset.reaction);
  }));
  $$("[data-message-photo]", conversation).forEach((button) => button.addEventListener("click", () => openMessageMediaViewer($("img", button).src)));
  $(".message-compose", conversation).addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("[data-message-input]", event.currentTarget);
    if (!input.value.trim() && !pendingMessagePhoto) return;
    sendMessage(input.value.trim(), pendingMessagePhoto);
    input.value = "";
  });
  conversation.onclick = (event) => {
    if (!event.target.closest(".theme-popover") && !event.target.closest("[data-toggle-theme]")) $("#themePopover").hidden = true;
    if (!event.target.closest(".composer-emoji-picker") && !event.target.closest("[data-add-emoji]")) $("#composerEmojiPicker").hidden = true;
    if (!event.target.closest(".message-cluster")) $$(".reaction-picker", conversation).forEach((picker) => picker.hidden = true);
  };
  requestAnimationFrame(() => {
    const body = $(".conversation-body", conversation);
    body.scrollTop = body.scrollHeight;
  });
}

function messageMarkup(message, chat, isLast) {
  const mine = message.sender === "me";
  const emojiOnly = message.text.length <= 12 && !/[a-z0-9]/i.test(message.text);
  return `<div class="message-row ${mine ? "mine" : ""}" data-message-id="${message.id}">
    ${mine ? "" : `<img src="${chat.participant.avatar}" alt="" />`}
    <div class="message-cluster">
      ${message.media ? `<button class="message-photo" type="button" data-message-photo><img src="${escapeHtml(message.media)}" alt="Shared photo" /></button>` : ""}
      ${message.text ? `<div class="message-bubble ${emojiOnly ? "emoji-only" : ""}">${escapeHtml(message.text)}</div>` : ""}
      <button type="button" class="message-react-trigger" data-open-reactions aria-label="React to message">${icon("smile")}</button>
      <div class="reaction-picker" hidden>${MESSAGE_REACTIONS.map((reaction) => `<button type="button" data-reaction="${reaction}" aria-label="React ${reaction}">${reaction}</button>`).join("")}</div>
      ${message.reaction ? `<button type="button" class="message-reaction" data-open-reactions>${message.reaction}</button>` : ""}
      ${mine && isLast ? `<small class="seen-label">Seen</small>` : ""}
    </div>
  </div>`;
}

async function saveConversationCustomization() {
  const chat = conversations.find((item) => item.id === activeConversationId);
  const panel = $("#themePopover");
  if (!chat) return;
  try {
    const updated = await api(`/api/conversations/${encodeURIComponent(chat.id)}/settings`, {
      method: "PUT",
      body: JSON.stringify({
        nickname: $("#conversationNickname").value.trim(),
        theme: panel.dataset.selectedTheme || chat.theme,
        defaultEmoji: panel.dataset.selectedEmoji || chat.defaultEmoji || "❤️"
      })
    });
    Object.assign(chat, updated);
    renderChats();
    showToast("Conversation settings saved.");
  } catch (error) {
    showToast(error.message);
  }
}

async function reactToMessage(messageId, reaction) {
  await api(`/api/messages/${encodeURIComponent(messageId)}/reaction`, {
    method: "PATCH",
    body: JSON.stringify({ reaction })
  });
  await renderConversation(activeConversationId);
}

async function previewMessagePhoto(event) {
  const [file] = event.target.files;
  if (!file) return;
  try {
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) throw new Error("Choose an image smaller than 10 MB.");
    pendingMessagePhoto = await resizeImage(file, 1400, 1400);
    $("#messagePhotoPreviewImage").src = pendingMessagePhoto;
    $("#messagePhotoPreview").hidden = false;
    $("[data-message-input]").focus();
  } catch (error) {
    showToast(error.message);
  } finally {
    event.target.value = "";
  }
}

function clearMessagePhoto() {
  pendingMessagePhoto = "";
  $("#messagePhotoPreview").hidden = true;
  $("#messagePhotoPreviewImage").removeAttribute("src");
}

function openMessageMediaViewer(source) {
  $("#messageMediaViewerImage").src = source;
  $("#messageMediaViewer").hidden = false;
  document.body.style.overflow = "hidden";
}

function closeMessageMediaViewer() {
  $("#messageMediaViewer").hidden = true;
  $("#messageMediaViewerImage").removeAttribute("src");
  document.body.style.overflow = "";
}

async function sendMessage(text, media = "") {
  const chat = conversations.find((item) => item.id === activeConversationId);
  if (!chat || (!text.trim() && !media)) return;
  try {
    const message = await api(`/api/conversations/${encodeURIComponent(chat.id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ text: text.trim(), media })
    });
    pendingMessagePhoto = "";
    chat.preview = message.text || "📷 Photo";
    chat.time = "Now";
    chat.updatedAt = message.createdAt;
    renderChats();
  } catch (error) {
    showToast(error.message);
  }
}

function renderProfile() {
  const profileImages = [currentUser.avatar, ...posts.map((post) => post.image)].slice(1, 7);
  $("#profileGrid").innerHTML = profileImages.map((image, index) => `<img src="${image}" alt="Dish ${index + 1}" />`).join("");
}

function renderNotifications() {
  const items = [
    { creator: creators[0], text: "liked your <strong>Garlic Butter Prawns</strong>.", time: "8 minutes ago" },
    { creator: creators[1], text: "started following your kitchen.", time: "42 minutes ago" },
    { creator: creators[2], text: "commented: <strong>I'm making this tonight!</strong>", time: "2 hours ago" },
    { creator: creators[3], text: "saved your <strong>Crispy Tofu Sisig</strong>.", time: "Yesterday" }
  ];
  $("#notificationList").innerHTML = items.map((item) => `<article class="notification"><img src="${item.creator.avatar}" alt="" /><div><p><strong>${escapeHtml(item.creator.name)}</strong> ${item.text}</p><time>${item.time}</time></div></article>`).join("");
}

function navigate(pageName) {
  $$(".page").forEach((page) => { page.hidden = true; page.classList.remove("active"); });
  const page = $(`#page-${pageName}`);
  if (!page) return;
  page.hidden = false;
  page.classList.add("active");
  $$('[data-page]').forEach((button) => button.classList.toggle("active", button.dataset.page === pageName));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (pageName === "discover") setTimeout(() => $("#discoverSearch").focus({ preventScroll: true }), 50);
  if (pageName === "settings") hydrateSettings();
}

function openProfileEditor() {
  pendingAvatar = currentUser.avatar;
  pendingCover = currentUser.cover || TEST_ACCOUNT.cover;
  $("#avatarPreview").src = pendingAvatar;
  $("#coverPreview").src = pendingCover;
  $("#editName").value = currentUser.name || "";
  $("#editUsername").value = (currentUser.username || "").replace(/^@/, "");
  $("#editBio").value = currentUser.bio || "";
  $("#editAge").value = currentUser.age || "";
  $("#editLocation").value = currentUser.location || "";
  $("#editWebsite").value = currentUser.website || "";
  $("#editPrivate").checked = Boolean(currentUser.isPrivate);
  $("#avatarImageInput").value = "";
  $("#coverImageInput").value = "";
  $("#profileEditorError").textContent = "";
  updateBioCount();
  $("#editProfileModal").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#editName").focus(), 20);
}

function closeProfileEditor() {
  $("#editProfileModal").hidden = true;
  document.body.style.overflow = "";
}

function updateBioCount() {
  $("#bioCount").textContent = $("#editBio").value.length;
}

async function previewProfileMedia(event, type) {
  const [file] = event.target.files;
  if (!file) return;
  const error = $("#profileEditorError");
  error.textContent = "";
  try {
    if (!file.type.startsWith("image/")) throw new Error("Choose a valid image file.");
    if (file.size > 10 * 1024 * 1024) throw new Error("Images must be smaller than 10 MB.");
    const image = await resizeImage(file, type === "avatar" ? 600 : 1600, type === "avatar" ? 600 : 700);
    if (type === "avatar") {
      pendingAvatar = image;
      $("#avatarPreview").src = image;
    } else {
      pendingCover = image;
      $("#coverPreview").src = image;
    }
  } catch (mediaError) {
    error.textContent = mediaError.message;
    event.target.value = "";
  }
}

function resizeImage(file, maxWidth, maxHeight) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That image format is not supported."));
      image.onload = () => {
        const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        context.fillStyle = "#f7f3ea";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function saveProfile(event) {
  event.preventDefault();
  const error = $("#profileEditorError");
  const button = $("#saveProfileButton");
  const name = $("#editName").value.trim();
  const usernameValue = $("#editUsername").value.trim().replace(/^@/, "");
  const ageValue = $("#editAge").value.trim();
  const age = ageValue ? Number(ageValue) : null;
  const website = $("#editWebsite").value.trim();
  error.textContent = "";

  if (name.length < 2) return error.textContent = "Display name must contain at least 2 characters.";
  if (!/^[a-zA-Z0-9._]{2,30}$/.test(usernameValue)) return error.textContent = "Use 2-30 letters, numbers, periods, or underscores for the username.";
  if (age !== null && (!Number.isInteger(age) || age < 13 || age > 120)) return error.textContent = "Enter an age between 13 and 120.";

  button.disabled = true;
  button.querySelector("span").textContent = "Saving...";
  const oldUsername = currentUser.username;
  try {
    currentUser = await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
      name,
      username: `@${usernameValue}`,
      bio: $("#editBio").value.trim(),
      age,
      location: $("#editLocation").value.trim(),
      website,
      isPrivate: $("#editPrivate").checked,
      avatar: pendingAvatar,
      cover: pendingCover
      })
    });

    const authoredPosts = posts.filter((post) => post.creator.id === currentUser.id || post.creator.username === oldUsername);
    for (const post of authoredPosts) {
      post.creator = { ...post.creator, id: currentUser.id, name, username: currentUser.username, avatar: currentUser.avatar };
    }

    hydrateUser();
    renderStories();
    renderFeed();
    renderProfile();
    closeProfileEditor();
    showToast("Your profile changes have been saved.");
  } catch (saveError) {
    console.error(saveError);
    error.textContent = saveError.message || "Your profile could not be saved. Please try again.";
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Save changes";
  }
}

function openUploadModal() {
  renderDishCategoryOptions($("#dishCategory").value);
  renderDishImagePreviews();
  renderTimelineSteps();
  $("#uploadError").textContent = "";
  $("#uploadModal").hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#dishName").focus(), 20);
}

function closeUploadModal() {
  $("#uploadModal").hidden = true;
  document.body.style.overflow = "";
}

function renderDishCategoryOptions(preferredCategory) {
  const cuisine = $("#dishCuisine").value;
  const categories = DISH_CATEGORIES[cuisine] || ["Specialties"];
  const selected = categories.includes(preferredCategory) ? preferredCategory : categories[0];
  $("#dishCategory").value = selected;
  $("#categoryHelp").textContent = `Choose what kind of ${cuisine} dish this is.`;
  $("#dishCategoryOptions").innerHTML = categories.map((category) => `<button type="button" class="dish-category-option ${category === selected ? "active" : ""}" data-dish-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
  $$("[data-dish-category]").forEach((button) => button.addEventListener("click", () => {
    $("#dishCategory").value = button.dataset.dishCategory;
    $$("[data-dish-category]").forEach((item) => item.classList.toggle("active", item === button));
  }));
}

async function previewDishImages(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  const availableSlots = 5 - pendingDishImages.length;
  if (availableSlots <= 0) return showToast("You can attach up to 5 photos.");
  try {
    const selectedFiles = files.slice(0, availableSlots);
    if (selectedFiles.some((file) => !file.type.startsWith("image/") || file.size > 10 * 1024 * 1024)) throw new Error("Each photo must be an image smaller than 10 MB.");
    const images = await Promise.all(selectedFiles.map((file) => resizeImage(file, 1600, 1600)));
    pendingDishImages.push(...images);
    if (files.length > availableSlots) showToast("Only the first 5 photos were added.");
    renderDishImagePreviews();
  } catch (error) {
    showToast(error.message);
  } finally {
    event.target.value = "";
  }
}

function renderDishImagePreviews() {
  const hasImages = pendingDishImages.length > 0;
  $("#chooseDishImages").hidden = hasImages;
  $("#imagePreviewGrid").hidden = !hasImages;
  $("#uploadMediaToolbar").hidden = !hasImages;
  $("#addMorePhotos").hidden = pendingDishImages.length >= 5;
  $("#photoCount").textContent = `${pendingDishImages.length} of 5 photos`;
  $("#imagePreviewGrid").innerHTML = pendingDishImages.map((image, index) => `<figure class="upload-preview"><img src="${image}" alt="Dish photo ${index + 1}" /><button class="remove-preview" type="button" data-remove-photo="${index}" aria-label="Remove photo ${index + 1}">${icon("x")}</button></figure>`).join("");
  $$("[data-remove-photo]").forEach((button) => button.addEventListener("click", () => {
    pendingDishImages.splice(Number(button.dataset.removePhoto), 1);
    renderDishImagePreviews();
  }));
}

function addTimelineStep(step = {}) {
  timelineSteps = collectTimelineSteps(false);
  timelineSteps.push({
    id: `timeline-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    minute: step.minute ?? "",
    instruction: step.instruction || "",
    ingredients: step.ingredients || ""
  });
  renderTimelineSteps();
  setTimeout(() => $(".timeline-step:last-child [data-timeline-minute]")?.focus(), 20);
}

function collectTimelineSteps(onlyComplete = true) {
  return $$("[data-timeline-step]").map((element) => ({
    id: element.dataset.timelineStep,
    minute: $("[data-timeline-minute]", element).value,
    instruction: $("[data-timeline-instruction]", element).value.trim(),
    ingredients: $("[data-timeline-ingredients]", element).value.trim()
  })).filter((step) => !onlyComplete || step.minute !== "" || step.instruction || step.ingredients);
}

function renderTimelineSteps() {
  $("#timelineSteps").innerHTML = timelineSteps.length ? timelineSteps.map((step, index) => `<article class="timeline-step" data-timeline-step="${step.id}">
    <label class="field timeline-minute"><span>At minute</span><input type="number" min="0" max="1440" data-timeline-minute value="${escapeHtml(step.minute)}" placeholder="${index * 5}" /><b>min</b></label>
    <label class="field"><span>What happens?</span><input maxlength="200" data-timeline-instruction value="${escapeHtml(step.instruction)}" placeholder="e.g. Boil the water" /></label>
    <label class="field"><span>Ingredients added</span><input maxlength="120" data-timeline-ingredients value="${escapeHtml(step.ingredients)}" placeholder="e.g. Pasta, salt" /></label>
    <button class="remove-timeline-step" type="button" data-remove-timeline="${step.id}" aria-label="Remove timeline step">${icon("x")}</button>
  </article>`).join("") : `<div class="empty-timeline">No timeline yet. Add steps such as “5 min · Boil water” or “10 min · Add the meat.”</div>`;
  $$("[data-remove-timeline]").forEach((button) => button.addEventListener("click", () => {
    timelineSteps = collectTimelineSteps(false).filter((step) => step.id !== button.dataset.removeTimeline);
    renderTimelineSteps();
  }));
}

async function createPost(event) {
  event.preventDefault();
  const errorElement = $("#uploadError");
  const submit = event.submitter;
  const timeline = collectTimelineSteps().map((step) => ({ minute: Number(step.minute), instruction: step.instruction, ingredients: step.ingredients }));
  errorElement.textContent = "";
  if (!pendingDishImages.length) return errorElement.textContent = "Add at least one photo of your dish.";
  if (!$("#dishCategory").value) return errorElement.textContent = "Choose a dish category.";
  if (timeline.some((step) => !Number.isInteger(step.minute) || step.minute < 0 || step.minute > 1440 || step.instruction.length < 2)) return errorElement.textContent = "Each timeline step needs a valid minute and an instruction.";
  if (submit) submit.disabled = true;
  try {
    const post = await api("/api/posts", {
      method: "POST",
      body: JSON.stringify({
        title: $("#dishName").value.trim(),
        cuisine: $("#dishCuisine").value,
        category: $("#dishCategory").value,
        meal: "Homemade",
        cookingTime: $("#dishTime").value.trim() || "30 min",
        image: pendingDishImages[0],
        images: pendingDishImages,
        caption: $("#dishCaption").value.trim(),
        ingredients: $("#dishIngredients").value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20),
        timeline
      })
    });
    posts.unshift(post);
    $("#uploadForm").reset();
    pendingDishImages = [];
    timelineSteps = [];
    renderDishImagePreviews();
    renderTimelineSteps();
    renderDishCategoryOptions();
    closeUploadModal();
    renderAll();
    navigate("home");
    showToast("Your dish is now on the table.");
  } catch (error) {
    errorElement.textContent = error.message;
  } finally {
    if (submit) submit.disabled = false;
  }
}

function openNotifications() {
  $("#notificationBackdrop").hidden = false;
  $("#notificationDrawer").classList.add("open");
  $("#notificationDrawer").setAttribute("aria-hidden", "false");
}

function closeNotifications() {
  $("#notificationDrawer").classList.remove("open");
  $("#notificationDrawer").setAttribute("aria-hidden", "true");
  setTimeout(() => $("#notificationBackdrop").hidden = true, 280);
}

function handleKeyboard(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && currentUser) {
    event.preventDefault();
    navigate("discover");
  }
  if (event.key === "Escape") {
    closeUploadModal();
    closeCreateStory();
    closeStoryViewer();
    closePublicProfile();
    closeMessageMediaViewer();
    closeProfileEditor();
    closeNotifications();
  }
}

function showFormError(message) { $("#formError").textContent = message; }
function firstName(name) { return name.split(" ")[0]; }
function formatCount(number) { return number > 999 ? `${(number / 1000).toFixed(1)}k` : String(number); }
function relativeTime(timestamp) {
  const seconds = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

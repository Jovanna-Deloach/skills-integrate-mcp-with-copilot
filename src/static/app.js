document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const authHint = document.getElementById("auth-hint");

  const loginToggle = document.getElementById("login-toggle");
  const authLabel = document.getElementById("auth-label");
  const loginModal = document.getElementById("login-modal");
  const closeLoginButton = document.getElementById("close-login");
  const loginForm = document.getElementById("login-form");

  const TOKEN_STORAGE_KEY = "adminToken";
  const USERNAME_STORAGE_KEY = "adminUsername";

  const state = {
    token: localStorage.getItem(TOKEN_STORAGE_KEY),
    username: localStorage.getItem(USERNAME_STORAGE_KEY),
  };

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showMessage(text, type = "info") {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");

    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  function applyAuthUiState() {
    const isAuthenticated = Boolean(state.token);

    if (isAuthenticated) {
      authLabel.textContent = `Logged in: ${state.username} (Logout)`;
      signupForm.classList.remove("blocked");
      authHint.textContent = "Teacher mode is enabled.";
    } else {
      authLabel.textContent = "Teacher login";
      signupForm.classList.add("blocked");
      authHint.textContent =
        "Teacher login is required to register or unregister students.";
    }
  }

  function authHeaders() {
    if (!state.token) {
      return {};
    }

    return {
      "x-admin-token": state.token,
    };
  }

  async function validateExistingSession() {
    if (!state.token) {
      return;
    }

    try {
      const response = await fetch("/auth/session", {
        headers: authHeaders(),
      });

      if (!response.ok) {
        throw new Error("session expired");
      }
    } catch (error) {
      state.token = "";
      state.username = "";
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USERNAME_STORAGE_KEY);
    }
  }

  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      activitiesList.innerHTML = "";
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      const canManage = Boolean(state.token);

      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map((email) => {
                    const safeEmail = escapeHtml(email);
                    const safeActivity = escapeHtml(name);
                    const manageButton = canManage
                      ? `<button class="delete-btn" data-activity="${safeActivity}" data-email="${safeEmail}">Unregister</button>`
                      : "";
                    return `<li><span class="participant-email">${safeEmail}</span>${manageButton}</li>`;
                  })
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${escapeHtml(name)}</h4>
          <p>${escapeHtml(details.description)}</p>
          <p><strong>Schedule:</strong> ${escapeHtml(details.schedule)}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.token) {
      showMessage("Teacher login required.", "error");
      return;
    }

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
          headers: authHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(result.message, "success");
        signupForm.reset();
        fetchActivities();
      } else {
        showMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage("Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  loginToggle.addEventListener("click", async () => {
    if (state.token) {
      await fetch("/auth/logout", {
        method: "POST",
        headers: authHeaders(),
      });

      state.token = "";
      state.username = "";
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USERNAME_STORAGE_KEY);

      applyAuthUiState();
      fetchActivities();
      showMessage("Logged out", "info");
      return;
    }

    loginModal.classList.remove("hidden");
  });

  closeLoginButton.addEventListener("click", () => {
    loginModal.classList.add("hidden");
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch(
        `/auth/login?username=${encodeURIComponent(
          username
        )}&password=${encodeURIComponent(password)}`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        showMessage(result.detail || "Login failed", "error");
        return;
      }

      state.token = result.token;
      state.username = result.username;
      localStorage.setItem(TOKEN_STORAGE_KEY, state.token);
      localStorage.setItem(USERNAME_STORAGE_KEY, state.username);

      loginForm.reset();
      loginModal.classList.add("hidden");

      applyAuthUiState();
      fetchActivities();
      showMessage(`Logged in as ${result.username}`, "success");
    } catch (error) {
      showMessage("Login failed. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  window.addEventListener("click", (event) => {
    if (event.target === loginModal) {
      loginModal.classList.add("hidden");
    }
  });

  async function init() {
    await validateExistingSession();
    applyAuthUiState();
    fetchActivities();
  }

  init();
});

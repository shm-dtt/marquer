document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  await loadBookmarkFolders();
  setupEventListeners();
});

function setupTabs() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.dataset.tab;

      // Update active tab button
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      // Update active tab content
      tabContents.forEach((content) => content.classList.remove("active"));
      document.getElementById(targetTab + "Tab").classList.add("active");
    });
  });
}

async function loadBookmarkFolders() {
  try {
    const bookmarkTree = await chrome.bookmarks.getTree();
    const folderSelect = document.getElementById("folderSelect");

    // Clear existing options
    folderSelect.innerHTML =
      '<option value="">Select a folder to export</option>';

    // Recursively add folders to select
    function addFoldersToSelect(nodes, prefix = "") {
      nodes.forEach((node) => {
        if (node.children) {
          // Skip root nodes (Bookmarks Bar, Other Bookmarks, etc.)
          if (node.parentId) {
            const option = document.createElement("option");
            option.value = node.id;
            option.textContent = prefix + node.title;
            folderSelect.appendChild(option);
          }

          // Recursively add child folders
          if (node.children.length > 0) {
            addFoldersToSelect(
              node.children,
              prefix + (node.parentId ? "  " : "")
            );
          }
        }
      });
    }

    addFoldersToSelect(bookmarkTree);
  } catch (error) {
    console.error("Error loading bookmark folders:", error);
    showStatus("exportStatus", "Error loading bookmark folders", "error");
  }
}

function setupEventListeners() {
  const folderSelect = document.getElementById("folderSelect");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  const fileInputButton = document.getElementById("fileInputButton");

  // Update bookmark count when folder is selected
  folderSelect.addEventListener("change", updateBookmarkCount);

  // Export button
  exportBtn.addEventListener("click", exportBookmarks);

  // Import button
  importBtn.addEventListener("click", importBookmarks);

  // File input handling
  fileInputButton.addEventListener("click", () => {
    importFile.click();
  });

  importFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      fileInputButton.innerHTML = `
            <span class="material-symbols-rounded">description</span>
            ${file.name}
          `;
      fileInputButton.classList.add("has-file");
    } else {
      fileInputButton.innerHTML = `
            <span class="material-symbols-rounded">upload_file</span>
            Choose JSON file
          `;
      fileInputButton.classList.remove("has-file");
    }
  });
}

async function updateBookmarkCount() {
  const folderSelect = document.getElementById("folderSelect");
  const bookmarkCount = document.getElementById("bookmarkCount");
  const selectedFolderId = folderSelect.value;

  if (!selectedFolderId) {
    bookmarkCount.textContent = "";
    return;
  }

  try {
    const children = await chrome.bookmarks.getSubTree(selectedFolderId);
    const count = countBookmarks(children[0]);
    bookmarkCount.textContent = `${count} bookmarks in this folder`;
  } catch (error) {
    bookmarkCount.textContent = "Error counting bookmarks";
  }
}

function countBookmarks(node) {
  let count = 0;
  if (node.children) {
    node.children.forEach((child) => {
      if (child.url) {
        count++;
      } else if (child.children) {
        count += countBookmarks(child);
      }
    });
  }
  return count;
}

async function exportBookmarks() {
  const folderSelect = document.getElementById("folderSelect");
  const selectedFolderId = folderSelect.value;
  const exportBtn = document.getElementById("exportBtn");

  if (!selectedFolderId) {
    showStatus("exportStatus", "Please select a folder to export", "error");
    return;
  }

  try {
    exportBtn.innerHTML = '<span class="loading"></span>Exporting...';
    exportBtn.disabled = true;

    // Get the selected folder and its contents
    const bookmarkTree = await chrome.bookmarks.getSubTree(selectedFolderId);
    const folderData = bookmarkTree[0];

    // Create export data
    const exportData = {
      name: folderData.title,
      exportDate: new Date().toISOString(),
      bookmarks: folderData.children || [],
      metadata: {
        totalBookmarks: countBookmarks(folderData),
        version: "1.0",
      },
    };

    // Create and download file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const filename = `bookmarks_${folderData.title.replace(
      /[^a-zA-Z0-9]/g,
      "_"
    )}_${new Date().toISOString().split("T")[0]}.json`;

    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true,
    });

    showStatus("exportStatus", "Bookmarks exported successfully!", "success");
  } catch (error) {
    console.error("Error exporting bookmarks:", error);
    showStatus("exportStatus", "Error exporting bookmarks", "error");
  } finally {
    exportBtn.innerHTML =
      '<span class="material-symbols-rounded">download</span>Export Selected Folder';
    exportBtn.disabled = false;
  }
}

async function importBookmarks() {
  const importFile = document.getElementById("importFile");
  const importBtn = document.getElementById("importBtn");

  if (!importFile.files || importFile.files.length === 0) {
    showStatus("importStatus", "Please select a file to import", "error");
    return;
  }

  try {
    importBtn.innerHTML = '<span class="loading"></span>Importing...';
    importBtn.disabled = true;

    const file = importFile.files[0];
    const fileContent = await readFileAsText(file);
    const importData = JSON.parse(fileContent);

    // Validate import data
    if (!importData.name || !importData.bookmarks) {
      throw new Error("Invalid bookmark file format");
    }

    // Create a new folder for imported bookmarks
    const timestamp = new Date().toLocaleDateString();
    const folderName = `${importData.name} (imported ${timestamp})`;

    const newFolder = await chrome.bookmarks.create({
      parentId: "1", // Other Bookmarks folder
      title: folderName,
    });

    // Import bookmarks recursively
    await importBookmarkNode(importData.bookmarks, newFolder.id);

    showStatus(
      "importStatus",
      `Successfully imported ${
        importData.metadata?.totalBookmarks || "unknown"
      } bookmarks!`,
      "success"
    );

    // Clear file input
    importFile.value = "";
    document.getElementById("fileInputButton").innerHTML = `
          <span class="material-symbols-rounded">upload_file</span>
          Choose JSON file
        `;
    document.getElementById("fileInputButton").classList.remove("has-file");
  } catch (error) {
    console.error("Error importing bookmarks:", error);
    showStatus(
      "importStatus",
      "Error importing bookmarks: " + error.message,
      "error"
    );
  } finally {
    importBtn.innerHTML =
      '<span class="material-symbols-rounded">upload</span>Import Bookmark Collection';
    importBtn.disabled = false;
  }
}

async function importBookmarkNode(nodes, parentId) {
  for (const node of nodes) {
    if (node.url) {
      // It's a bookmark
      await chrome.bookmarks.create({
        parentId: parentId,
        title: node.title,
        url: node.url,
      });
    } else if (node.children) {
      // It's a folder
      const newFolder = await chrome.bookmarks.create({
        parentId: parentId,
        title: node.title,
      });

      // Recursively import children
      await importBookmarkNode(node.children, newFolder.id);
    }
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

function showStatus(elementId, message, type) {
  const statusElement = document.getElementById(elementId);
  statusElement.innerHTML = `
        <span class="material-symbols-rounded">${
          type === "success" ? "check_circle" : "error"
        }</span>
        ${message}
      `;
  statusElement.className = `status ${type}`;
  statusElement.style.display = "flex";

  // Hide status after 5 seconds
  setTimeout(() => {
    statusElement.style.display = "none";
  }, 5000);
}

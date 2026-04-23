# OpenLIME Submodule Management

OCRA uses a custom branch of **OpenLIME** ("ocra-integration") for some specific features of the 2D viewer. 
Since OpenLIME is not published in the official registry and we need to keep our development synchronized, the library has been added as a **git submodule** in the `frontend/openlime` folder.

Below is the guide for developers to manage the project the first time or in case an update causes issues.

---

## 1. First Setup or Updates

When cloning the repository for the first time, or when a colleague has updated the submodule pointer with a `git pull`, the `frontend/openlime` folder might be empty or out of sync.

### A. Populate the Submodule
Tell Git to initialize and download the files referenced in the submodule:
```bash
git submodule update --init --recursive
```
*(Note: to skip this step and clone the submodule automatically in the future, use the command: `git clone --recurse-submodules <OCRA_URL>`)*

### B. OpenLIME Installation and Build
The OpenLIME submodule is downloaded as pure, uncompiled source code. To generate the necessary files (such as `dist` folders and their respective JavaScript or TypeScript definitions), you must compile it separately the very first time or whenever it gets updated.

Run sequentially from the OCRA root:
```bash
cd frontend/openlime
npm install
npm run rollup
npm run build-types
```

### C. Installing Frontend Dependencies
At this point, OpenLIME is built and ready to be linked to the frontend. 
The dependency in the frontend's `package.json` is configured as a local link (e.g., `"openlime": "file:./openlime"`). 
When you run the frontend's `install` command, npm or vite will automatically link to that prepared folder.

```bash
cd ..  # Return to the frontend folder
npm install
```

From this moment on, you can start the development server normally (e.g., `npm run dev`) without any *Module Not Found* issues.

---

## 2. Pushing Changes to OpenLIME
If you need to make changes not to the OCRA interface but to the **OpenLIME source code** located inside `frontend/openlime`:

1. Enter the submodule and switch to a local branch that tracks the remote integration branch. After `git submodule update`, the submodule is typically in **detached HEAD**, so create or switch to the tracking branch before editing:
   ```bash
   cd frontend/openlime
   git switch ocra-integration || git switch -c ocra-integration --track origin/ocra-integration
   ```
2. Make the desired change in the source files (`src/`) inside `frontend/openlime`.
3. Do a local build to test it immediately in OCRA: `npm run rollup`.
4. Once you verify it works, you must **commit the submodule changes**:
   ```bash
   git add modified-file-name
   git commit -m "fix(ocra): fix render issue..."
   git push origin ocra-integration
   ```
5. After doing this, if you check the project's root status, you will notice that Git marks the file repository pointer `frontend/openlime` as modified. Commit this in the main OCRA repo:
   ```bash
   cd ../..
   git add frontend/openlime
   git commit -m "chore: bump openlime submodule commit pointer"
   git push
   ```

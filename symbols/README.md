# Custom Icons/Symbols Folder

This folder contains all the custom icons and symbols used in the DocCompare application. You can replace the default icons with your own custom versions.

## Icons Required

Add the following icon files to this folder:

### 1. **logo.svg** (40x40px)
- Used as the main logo in the header
- Should be your company/application logo
- Will be animated with a spinning effect

### 2. **file-icon.svg** (16x16px)
- Used next to "File 1" and "File 2" labels
- Small icon representing a document/file

### 3. **folder-icon.svg** (36x36px)
- Used in the file drop zones
- Large icon representing a folder for file selection

### 4. **lightning.svg** (20x20px)
- Used on the "Compare Documents" button
- Should represent action/processing/comparison

### 5. **check.svg** (24x24px)
- Used in the results header (✓ icon)
- Represents success/completion

### 6. **download.svg** (16x16px)
- Used on the "Download Report" button
- Standard download icon

### 7. **copy.svg** (16x16px)
- Used on the "Copy Results" button
- Standard copy icon

### 8. **refresh.svg** (16x16px)
- Used on the "New Comparison" button
- Standard refresh/reset icon

## How to Add Custom Icons

1. **Create or obtain SVG files** for each icon listed above
2. **Save them with the exact names** listed above
3. **Ensure they are in SVG format** (.svg extension)
4. **Optimize SVG files** - make sure they render cleanly at their specified sizes

## Icon Format Recommendations

- **Format**: SVG (Scalable Vector Graphics)
- **Color**: Use a single color or ensure colors work with the application theme
- **Transparency**: Supported
- **Size**: Files should be created at the specified dimensions above

## Quick Setup Option

If you don't have custom icons yet, you can:
1. Use free SVG icon libraries like:
   - Font Awesome (https://fontawesome.com/)
   - Material Icons (https://fonts.google.com/icons)
   - Feather Icons (https://feathericons.com/)
   - Tabler Icons (https://tabler-icons.io/)

2. Download the icons you need
3. Save them with the correct filenames in this folder

## Notes

- If an icon file is missing, the application will show a broken image placeholder
- All icons are referenced with relative paths, so they must be in this exact folder
- You can edit the image sizes in index.html if you need different dimensions

---

**Example SVG Icon Structure:**
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path fill="currentColor" d="..."/>
</svg>
```

Use `fill="currentColor"` to make icons inherit the text color from the HTML.

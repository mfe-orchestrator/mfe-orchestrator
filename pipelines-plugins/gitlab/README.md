
# upload-microfrontend

**A CLI script and GitLab CI template to zip and upload microfrontends via REST API.**

---

## Description

This project provides:

- A **Node.js script** that accepts the following inputs:
  - `apikey`
  - `microfrontendSlug`
  - `domain`
  - `filePath`
  - `version`

- Zips the specified folder (`filePath`).

- Uploads the ZIP file via POST to:  
  `https://domain/microfrontends/by-slug/:microfrontendSlug/upload/:version`

- A reusable GitLab CI template integrating the script into your CI/CD pipelines.

---

## How it works

1. The script creates a ZIP archive of the given folder.
2. Performs a POST request to the specified API endpoint, uploading the ZIP file.
3. Handles errors and provides clear messages in case of failure.

---

## Installation

You can install the script globally via npm (from the GitLab repository):

```bash
npm install -g git+https://gitlab.com/<your-user>/<your-repo>.git
```

---

## CLI Usage

```bash
upload-microfrontend --apikey=APIKEY --slug=MICROFRONTEND_SLUG --domain=DOMAIN --path=FILE_PATH --version=VERSION
```

Example:

```bash
upload-microfrontend --apikey=abc123 --slug=myfrontend --domain=https://example.com --path=./dist --version=1.0.0
```

---

## GitLab CI Integration

### 1. Include the template in your project's `.gitlab-ci.yml`:

```yaml
include:
  - project: '<your-user>/<your-repo>'
    file: '/.gitlab-ci.yml'
```

### 2. Define a job that extends the template and provides variables:

```yaml
stages:
  - deploy

deploy_microfrontend:
  extends: upload_microfrontend
  variables:
    APIKEY: "your-api-key"
    MICROFRONTEND_SLUG: "my-frontend"
    DOMAIN: "https://example.com"
    FILE_PATH: "dist"
    VERSION: "1.0.0"
```

---

## Variables

| Name               | Description                                  | Required |
|--------------------|----------------------------------------------|----------|
| `APIKEY`           | API key for authentication                    | Yes      |
| `MICROFRONTEND_SLUG`| Identifier for the microfrontend              | Yes      |
| `DOMAIN`           | Base domain of the API (e.g. `https://example.com`) | Yes      |
| `FILE_PATH`        | Path to the folder to be zipped                | Yes      |
| `VERSION`          | Version of the microfrontend                     | Yes      |

---

## Requirements

- Node.js 18+  
- Write access to the `FILE_PATH` folder  
- API endpoint accepting ZIP files with Bearer Token authentication

---

## Contributing

1. Fork the repository  
2. Create a feature branch  
3. Make your changes and push  
4. Open a merge request

---

## License

MIT License © [Your Name or Company]

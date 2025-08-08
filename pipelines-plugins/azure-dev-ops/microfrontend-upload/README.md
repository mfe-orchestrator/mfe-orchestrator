# Microfrontend Upload Extension for Azure DevOps

This extension provides a custom task for Azure DevOps pipelines to upload microfrontend bundles to a specified domain.

## Features

- Zip and upload a file or directory to a microfrontend server
- Support for versioning
- Simple configuration through pipeline variables

## Prerequisites

- Node.js 16.x or later
- Azure DevOps organization
- Personal Access Token (PAT) with appropriate permissions

## Installation

1. Package the extension:
   ```bash
   npm install
   npm run build
   ```

2. Create the VSIX package:
   ```bash
   npm install -g tfx-cli
   tfx extension create --manifest-globs vss-extension.json
   ```

3. Upload the generated VSIX file to the [Azure DevOps Marketplace](https://marketplace.visualstudio.com/azuredevops).

## Usage in Pipeline

Add the following task to your Azure DevOps pipeline:

```yaml
- task: microfrontend-upload@1
  displayName: 'Upload Microfrontend'
  inputs:
    apiKey: '$(API_KEY)'
    microfrontendSlug: 'your-microfrontend-slug'
    domain: 'https://your-domain.com'
    filePath: '$(Build.ArtifactStagingDirectory)/your-app'
    version: '$(Build.BuildNumber)'
```

## Input Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| apiKey | Yes | The API key for authentication |
| microfrontendSlug | Yes | The slug identifier for the microfrontend |
| domain | Yes | The base domain where the microfrontend will be uploaded |
| filePath | Yes | The path to the file or directory to be zipped and uploaded |
| version | Yes | The version of the microfrontend (e.g., 1.0.0) |

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Test the task locally

## Publishing Updates

1. Update the version in `package.json` and `vss-extension.json`
2. Create a new release in GitHub
3. The GitHub Action will automatically package and publish the extension

## License

MIT

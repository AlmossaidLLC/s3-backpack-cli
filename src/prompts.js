import path from 'path';
import inquirerModule from 'inquirer';
import { normalizeEndpoint } from './shell.js';
import { promptPrefix } from './ui.js';

const inquirer = inquirerModule.default || inquirerModule;

function themed(questions) {
  return questions.map((question) => ({
    prefix: promptPrefix,
    ...question,
  }));
}

export async function askInstallMc() {
  const { install } = await inquirer.prompt(themed([
    {
      type: 'confirm',
      name: 'install',
      message: 'Install mc automatically to ~/.local/bin/mc?',
      default: true,
    },
  ]));
  return Boolean(install);
}

export async function askConnection() {
  const answers = await inquirer.prompt(themed([
    {
      type: 'input',
      name: 'endpointRaw',
      message: 'S3-compatible endpoint URL (example: https://minio.example.com):',
      validate: (v) => (String(v || '').trim() ? true : 'Endpoint is required'),
    },
    {
      type: 'input',
      name: 'accessKey',
      message: 'Access key:',
      validate: (v) => (String(v || '').trim() ? true : 'Access key is required'),
    },
    {
      type: 'password',
      name: 'secretKey',
      message: 'Secret key:',
      mask: '*',
      validate: (v) => (String(v || '').trim() ? true : 'Secret key is required'),
    },
  ]));

  return {
    endpoint: normalizeEndpoint(answers.endpointRaw),
    accessKey: String(answers.accessKey).trim(),
    secretKey: String(answers.secretKey).trim(),
  };
}

export async function askConnectionOptions() {
  const answers = await inquirer.prompt(themed([
    {
      type: 'confirm',
      name: 'insecure',
      message: 'Use insecure TLS (self-signed certificates)?',
      default: false,
    },
    {
      type: 'list',
      name: 'pathMode',
      message: 'S3 path style mode:',
      choices: [
        { name: 'auto (recommended)', value: 'auto' },
        { name: 'on (force path-style)', value: 'on' },
        { name: 'off (virtual-host style)', value: 'off' },
      ],
      default: 'auto',
    },
    {
      type: 'list',
      name: 'apiSignature',
      message: 'S3 API signature:',
      choices: [
        { name: 'S3v4 (recommended)', value: 'S3v4' },
        { name: 'S3v2 (legacy)', value: 'S3v2' },
      ],
      default: 'S3v4',
    },
    {
      type: 'input',
      name: 'region',
      message: 'Region (optional, useful for some providers):',
      default: '',
      filter: (v) => String(v || '').trim(),
    },
  ]));

  return {
    insecure: Boolean(answers.insecure),
    pathMode: answers.pathMode,
    apiSignature: answers.apiSignature,
    region: answers.region,
  };
}

export async function askOutput() {
  const answers = await inquirer.prompt(themed([
    {
      type: 'input',
      name: 'downloadDir',
      message: 'Download directory:',
      default: path.join(process.cwd(), 'backups'),
      filter: (v) => path.resolve(String(v || '').trim()),
    },
    {
      type: 'confirm',
      name: 'createZip',
      message: 'Create a zip archive for each bucket?',
      default: false,
    },
    {
      type: 'input',
      name: 'zipDir',
      message: 'Zip output directory:',
      when: (a) => a.createZip,
      default: (a) => a.downloadDir,
      filter: (v) => path.resolve(String(v || '').trim()),
    },
  ]));

  return {
    downloadDir: answers.downloadDir,
    createZip: Boolean(answers.createZip),
    zipDir: answers.createZip ? answers.zipDir : null,
  };
}

export async function askBuckets(buckets) {
  const { selectedBuckets } = await inquirer.prompt(themed([
    {
      type: 'checkbox',
      name: 'selectedBuckets',
      message: 'Select buckets to back up:',
      choices: buckets,
      pageSize: 15,
      validate: (arr) => (arr && arr.length ? true : 'Select at least one bucket'),
    },
  ]));
  return selectedBuckets;
}

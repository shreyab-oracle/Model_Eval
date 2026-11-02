import {repository} from '../db/repository.mjs';

export async function workspaceRuns(){return repository.runs();}

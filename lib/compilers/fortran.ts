// Copyright (c) 2018, Forschungzentrum Juelich GmbH, Juelich Supercomputing Centre
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import * as fs from 'node:fs';
import path from 'node:path';

import type {CompilationResult, ExecutionOptionsWithEnv} from '../../types/compilation/compilation.interfaces.js';
import {SelectedLibraryVersion} from '../../types/libraries/libraries.interfaces.js';
import {BaseCompiler} from '../base-compiler.js';
import * as utils from '../utils.js';

import {GccFortranParser} from './argument-parsers.js';

export class FortranCompiler extends BaseCompiler {
    static get key() {
        return 'fortran';
    }

    protected override getArgumentParserClass(): any {
        return GccFortranParser;
    }

    override getStdVerOverrideDescription(): string {
        return 'Change the Fortran standard version of the compiler.';
    }

    getExactStaticLibNameAndPath(lib: string, libPaths: string[]): string {
        const libFilename = 'lib' + lib + '.a';

        // note: fortran doesn't use -llibname,
        //  you have to add the full filename to the commandline instead
        // this thus requires the libraries to be downloaded before we can figure out the compiler arguments
        for (const dir of libPaths) {
            const testpath = path.join(dir, libFilename);
            if (fs.existsSync(testpath)) {
                return testpath;
            }
        }

        return '';
    }

    override getStaticLibraryLinks(libraries: SelectedLibraryVersion[], libPaths: string[] = []) {
        return this.getSortedStaticLibraries(libraries)
            .filter(Boolean)
            .map(lib => this.getExactStaticLibNameAndPath(lib, libPaths));
    }

    override getIncludeArguments(libraries: SelectedLibraryVersion[], dirPath: string): string[] {
        const includeFlag = this.compiler.includeFlag || '-I';
        return libraries.flatMap(selectedLib => {
            const foundVersion = this.findLibVersion(selectedLib);
            if (!foundVersion) return [];

            const paths = foundVersion.path.map(path => includeFlag + path);
            if (foundVersion.packagedheaders) {
                const modPath = path.join(dirPath, selectedLib.id, 'mod');
                const includePath = path.join(dirPath, selectedLib.id, 'include');
                paths.push(`-I${modPath}`, includeFlag + includePath);
            }
            return paths;
        });
    }

    override async runCompiler(
        compiler: string,
        options: string[],
        inputFilename: string,
        execOptions: ExecutionOptionsWithEnv,
    ): Promise<CompilationResult> {
        if (!execOptions) {
            execOptions = this.getDefaultExecOptions();
        }
        // Switch working directory of compiler to temp directory that also holds the source.
        // This makes it possible to generate .mod files.
        execOptions.customCwd = path.dirname(inputFilename);

        const result = await this.exec(compiler, options, execOptions);
        const baseFilename = './' + path.basename(inputFilename);
        return {
            ...result,
            stdout: utils.parseOutput(result.stdout, baseFilename),
            stderr: utils.parseOutput(result.stderr, baseFilename),
            inputFilename: inputFilename,
        };
    }
}

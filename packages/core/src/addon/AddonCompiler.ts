import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import type { AddonLogger } from '../types/addon';

/**
 * Compiles addon TypeScript source to JavaScript.
 *
 * Output is placed in `.omni-cache/{addonId}/`. Recompilation is skipped
 * when no source file has been modified since the last successful build.
 */
export class AddonCompiler {
  private readonly projectRoot: string;
  private readonly cacheRoot: string;
  private readonly logger: AddonLogger;

  constructor(projectRoot: string, logger: AddonLogger) {
    this.projectRoot = projectRoot;
    this.cacheRoot = path.join(projectRoot, '.omni-cache');
    this.logger = logger;
  }

  async compile(addonId: string, addonDir: string): Promise<string> {
    const outDir = path.join(this.cacheRoot, addonId);
    const srcDir = path.join(addonDir, 'src');

    if (!fs.existsSync(srcDir)) {
      throw new Error(
        `Addon "${addonId}" has no src/ directory at ${srcDir}`,
      );
    }

    if (this.isCacheValid(addonId, srcDir, outDir)) {
      this.logger.debug(
        `Addon "${addonId}" cache is up-to-date, skipping compilation`,
      );
      return outDir;
    }

    this.logger.debug(`Compiling addon "${addonId}"...`);

    const sourceFiles = this.collectTypeScriptFiles(srcDir);
    if (sourceFiles.length === 0) {
      throw new Error(
        `Addon "${addonId}" has no TypeScript files in ${srcDir}`,
      );
    }

    const compilerOptions = this.loadCompilerOptions(outDir, srcDir);
    const program = ts.createProgram(sourceFiles, compilerOptions);
    const emitResult = program.emit();

    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .concat(emitResult.diagnostics);

    if (diagnostics.length > 0) {
      this.reportDiagnostics(addonId, diagnostics);
    }

    if (emitResult.emitSkipped) {
      throw new Error(
        `Compilation failed for addon "${addonId}". See log output above for details.`,
      );
    }

    this.writeCacheTimestamp(addonId);

    this.logger.debug(
      `Addon "${addonId}" compiled successfully (${sourceFiles.length} file(s))`,
    );

    return outDir;
  }

  /**
   * Read `tsconfig.addon.json` from the project root and override `outDir`
   * and `rootDir` to match the specific addon.
   */
  private loadCompilerOptions(
    outDir: string,
    rootDir: string,
  ): ts.CompilerOptions {
    const tsconfigPath = path.join(this.projectRoot, 'tsconfig.addon.json');

    if (!fs.existsSync(tsconfigPath)) {
      this.logger.warn(
        `tsconfig.addon.json not found at ${tsconfigPath}. Using sensible defaults.`,
      );
      return {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: false,
        sourceMap: true,
        outDir,
        rootDir,
      };
    }

    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
      this.logger.warn(
        `Error reading tsconfig.addon.json: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`,
      );
    }

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      this.projectRoot,
    );

    parsed.options.outDir = outDir;
    parsed.options.rootDir = rootDir;

    return parsed.options;
  }

  private collectTypeScriptFiles(dir: string): string[] {
    const results: string[] = [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.collectTypeScriptFiles(fullPath));
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.d.ts')
      ) {
        results.push(fullPath);
      }
    }

    return results;
  }

  /**
   * The cache is valid when the output directory exists, a `.buildstamp`
   * file is present, and every source file's mtime predates the stamp.
   */
  private isCacheValid(
    addonId: string,
    srcDir: string,
    outDir: string,
  ): boolean {
    const stampFile = path.join(this.cacheRoot, addonId, '.buildstamp');

    if (!fs.existsSync(outDir) || !fs.existsSync(stampFile)) {
      return false;
    }

    let stampTime: number;
    try {
      const content = fs.readFileSync(stampFile, 'utf-8').trim();
      stampTime = parseInt(content, 10);
      if (isNaN(stampTime)) {
        return false;
      }
    } catch {
      return false;
    }

    const sourceFiles = this.collectTypeScriptFiles(srcDir);
    for (const file of sourceFiles) {
      const stat = fs.statSync(file);
      if (stat.mtimeMs > stampTime) {
        return false;
      }
    }

    return true;
  }

  private writeCacheTimestamp(addonId: string): void {
    const stampDir = path.join(this.cacheRoot, addonId);
    fs.mkdirSync(stampDir, { recursive: true });
    fs.writeFileSync(
      path.join(stampDir, '.buildstamp'),
      Date.now().toString(),
      'utf-8',
    );
  }

  private reportDiagnostics(
    addonId: string,
    diagnostics: readonly ts.Diagnostic[],
  ): void {
    for (const diag of diagnostics) {
      const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');

      let location = '';
      if (diag.file && diag.start !== undefined) {
        const { line, character } = diag.file.getLineAndCharacterOfPosition(
          diag.start,
        );
        location = `${diag.file.fileName}(${line + 1},${character + 1}): `;
      }

      const severity =
        diag.category === ts.DiagnosticCategory.Error
          ? 'error'
          : diag.category === ts.DiagnosticCategory.Warning
            ? 'warn'
            : 'info';

      if (severity === 'error') {
        this.logger.error(`[${addonId}] ${location}${message}`);
      } else if (severity === 'warn') {
        this.logger.warn(`[${addonId}] ${location}${message}`);
      } else {
        this.logger.info(`[${addonId}] ${location}${message}`);
      }
    }
  }
}

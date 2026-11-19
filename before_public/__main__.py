import argparse
from pathlib import Path
from .scanner import load_rules, scan
from .report import write_report


def main(argv=None):
    parser = argparse.ArgumentParser(description='Local privacy checks; reports only, no automatic cleanup.')
    parser.add_argument('target', help='Directory, or repository root for Git modes')
    parser.add_argument('--config', required=True, help='Local JSON rules; keep this file outside public repositories')
    parser.add_argument('--mode', choices=['directory','staged','history'], default='directory')
    parser.add_argument('--output', default='before-public-report')
    args = parser.parse_args(argv)
    output = Path(args.output).resolve()
    if Path(args.target).resolve().is_relative_to(output):
        parser.error('Output must not be the target directory or one of its ancestors.')
    try:
        rules = load_rules(args.config)
        report = scan(args.target, rules, args.mode, args.config, output)
        write_report(report, output)
    except ValueError as error:
        print(str(error));return 2
    except OSError:
        print('Cannot read input or write report.');return 2
    print(f"Checked {report['counts']['entries']} entries: {len(report['findings'])} findings, {len(report['skipped'])} incompletely inspected.")
    return 2 if report['skipped'] else (1 if report['findings'] else 0)


if __name__ == '__main__':
    raise SystemExit(main())

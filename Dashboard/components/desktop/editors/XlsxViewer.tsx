'use client';

import { API_BASE } from '@/lib/api';
import { AlertCircle, Download, ExternalLink, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

interface XlsxViewerProps {
	filePath: string;
}

interface SheetData {
	name: string;
	data: (string | number | boolean | null)[][];
}

const MAX_TABLE_ROWS = 500;
const MAX_TABLE_COLS = 100;

/**
 * XLSX Viewer - displays Excel spreadsheets in a table view.
 * Uses SheetJS to parse .xlsx and .xls files client-side.
 */
export function XlsxViewer({ filePath }: XlsxViewerProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sheets, setSheets] = useState<SheetData[]>([]);
	const [activeSheet, setActiveSheet] = useState(0);

	const fileName = filePath.split('/').pop() || filePath;
	const apiPath = filePath.startsWith('Desktop/') ? filePath.slice(8) : filePath;
	const downloadUrl = `${API_BASE}/api/files/raw/${encodeURIComponent(apiPath)}`;

	const loadFile = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			// Fetch file as binary
			const response = await fetch(downloadUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch file: ${response.statusText}`);
			}

			const arrayBuffer = await response.arrayBuffer();

			// Parse with SheetJS
			const workbook = XLSX.read(arrayBuffer, { type: 'array' });

			// Extract all sheets
			const sheetsData: SheetData[] = workbook.SheetNames.map((sheetName) => {
				const worksheet = workbook.Sheets[sheetName];
				// Convert to array of arrays (header: 1 means first row is data, not keys)
				const jsonData = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
					worksheet,
					{ header: 1, defval: null }
				);
				return {
					name: sheetName,
					data: jsonData,
				};
			});

			setSheets(sheetsData);
			setActiveSheet(0);
		} catch (err) {
			console.error('Failed to load xlsx:', err);
			setError(err instanceof Error ? err.message : 'Failed to load file');
		} finally {
			setLoading(false);
		}
	}, [downloadUrl]);

	useEffect(() => {
		loadFile();
	}, [loadFile]);

	const handleDownload = useCallback(() => {
		const link = document.createElement('a');
		link.href = downloadUrl;
		link.download = fileName;
		link.click();
	}, [downloadUrl, fileName]);

	const handleOpenInApp = useCallback(() => {
		window.open(downloadUrl, '_blank');
	}, [downloadUrl]);

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: 'var(--surface-raised)' }}>
				<Loader2 className="w-8 h-8 animate-spin" style={{ color: '#217346' }} />
				<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading spreadsheet...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 p-8" style={{ background: 'var(--surface-sunken)' }}>
				<div className="flex flex-col items-center gap-3 max-w-md text-center">
					<AlertCircle className="w-10 h-10 text-red-400" />
					<p className="text-sm text-red-400">{error}</p>
					<p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
						Try downloading the file and opening it in Excel or Numbers.
					</p>
					<div className="flex gap-3 mt-4">
						<button
							onClick={handleDownload}
							className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
							style={{ background: '#217346', color: 'white' }}
						>
							<Download className="w-4 h-4" />
							Download
						</button>
						<button
							onClick={handleOpenInApp}
							className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors border"
							style={{
								borderColor: 'var(--border-default)',
								color: 'var(--text-secondary)',
								background: 'var(--surface-base)'
							}}
						>
							<ExternalLink className="w-4 h-4" />
							Open in App
						</button>
					</div>
				</div>
			</div>
		);
	}

	if (sheets.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-3" style={{ background: 'var(--surface-sunken)' }}>
				<FileSpreadsheet className="w-10 h-10" style={{ color: 'var(--text-tertiary)' }} />
				<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No sheets found in this file</p>
			</div>
		);
	}

	const currentSheet = sheets[activeSheet];
	const data = currentSheet?.data || [];
	const header = data[0] || [];
	const dataRows = data.slice(1, MAX_TABLE_ROWS + 1);
	const isTruncatedRows = data.length > MAX_TABLE_ROWS + 1;
	const isTruncatedCols = header.length > MAX_TABLE_COLS;
	const displayCols = Math.min(header.length, MAX_TABLE_COLS);

	return (
		<div className="flex flex-col h-full" style={{ background: 'var(--surface-raised)' }}>
			{/* Toolbar */}
			<div
				className="flex items-center justify-between px-3 py-1.5 shrink-0"
				style={{
					background: 'var(--surface-base)',
					borderBottom: '1px solid var(--border-subtle)',
				}}
			>
				{/* Sheet tabs */}
				<div className="flex items-center gap-1 overflow-x-auto">
					{sheets.map((sheet, idx) => (
						<button
							key={sheet.name}
							onClick={() => setActiveSheet(idx)}
							className="px-3 py-1 text-xs rounded transition-colors whitespace-nowrap"
							style={{
								color: activeSheet === idx ? '#217346' : 'var(--text-tertiary)',
								background: activeSheet === idx ? 'rgba(33, 115, 70, 0.1)' : 'transparent',
								fontWeight: activeSheet === idx ? 500 : 400,
							}}
						>
							{sheet.name}
						</button>
					))}
				</div>

				{/* Actions */}
				<div className="flex items-center gap-2 shrink-0 ml-4">
					<span className="text-xs" style={{ color: 'var(--text-muted)' }}>
						{data.length > 0 ? `${data.length - 1} rows` : '0 rows'}
						{isTruncatedRows && ` (showing ${MAX_TABLE_ROWS})`}
					</span>
					<button
						onClick={handleDownload}
						className="p-1.5 rounded transition-colors hover:bg-[var(--surface-accent)]"
						title="Download"
						style={{ color: 'var(--text-tertiary)' }}
					>
						<Download className="w-4 h-4" />
					</button>
					<button
						onClick={handleOpenInApp}
						className="p-1.5 rounded transition-colors hover:bg-[var(--surface-accent)]"
						title="Open in App"
						style={{ color: 'var(--text-tertiary)' }}
					>
						<ExternalLink className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Table */}
			<div className="flex-1 overflow-auto">
				{data.length === 0 ? (
					<div className="flex items-center justify-center h-full">
						<p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
							This sheet is empty
						</p>
					</div>
				) : (
					<div className="min-w-full">
						<table className="min-w-full text-xs border-collapse">
							<thead className="sticky top-0 z-10">
								<tr style={{ background: 'var(--surface-base)' }}>
									{/* Row number header */}
									<th
										className="px-2 py-2 text-center font-normal border-b border-r w-10"
										style={{
											borderColor: 'var(--border-subtle)',
											color: 'var(--text-muted)',
											background: 'var(--surface-base)',
										}}
									>
										#
									</th>
									{header.slice(0, displayCols).map((cell, idx) => (
										<th
											key={idx}
											className="px-3 py-2 text-left font-semibold border-b border-r whitespace-nowrap"
											style={{
												borderColor: 'var(--border-subtle)',
												color: 'var(--text-primary)',
												background: 'var(--surface-base)',
												minWidth: '80px',
												maxWidth: '300px',
											}}
										>
											{cell !== null && cell !== undefined ? String(cell) : `Column ${idx + 1}`}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{dataRows.map((row, rowIdx) => (
									<tr
										key={rowIdx}
										className="hover:bg-[var(--surface-accent)]"
										style={{ background: rowIdx % 2 === 0 ? 'var(--surface-raised)' : 'var(--surface-sunken)' }}
									>
										{/* Row number */}
										<td
											className="px-2 py-1.5 text-center border-b border-r text-[10px]"
											style={{
												borderColor: 'var(--border-subtle)',
												color: 'var(--text-muted)',
												background: 'var(--surface-base)',
											}}
										>
											{rowIdx + 2}
										</td>
										{Array.from({ length: displayCols }).map((_, cellIdx) => {
											const cell = row[cellIdx];
											return (
												<td
													key={cellIdx}
													className="px-3 py-1.5 border-b border-r"
													style={{
														borderColor: 'var(--border-subtle)',
														color: 'var(--text-primary)',
														maxWidth: '300px',
														overflow: 'hidden',
														textOverflow: 'ellipsis',
														whiteSpace: 'nowrap',
													}}
													title={cell !== null && cell !== undefined ? String(cell) : ''}
												>
													{cell !== null && cell !== undefined ? String(cell) : ''}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>

						{/* Truncation notice */}
						{(isTruncatedRows || isTruncatedCols) && (
							<div
								className="px-3 py-2 text-xs"
								style={{
									color: 'var(--text-tertiary)',
									background: 'var(--surface-base)',
									borderTop: '1px solid var(--border-subtle)',
								}}
							>
								{isTruncatedRows && isTruncatedCols
									? `Showing first ${MAX_TABLE_ROWS} rows and ${MAX_TABLE_COLS} columns. Download for full content.`
									: isTruncatedRows
										? `Showing first ${MAX_TABLE_ROWS} rows. Download for full content.`
										: `Showing first ${MAX_TABLE_COLS} columns. Download for full content.`}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Footer */}
			<div
				className="px-3 py-1 text-[10px] text-center shrink-0"
				style={{
					background: 'var(--surface-base)',
					borderTop: '1px solid var(--border-subtle)',
					color: 'var(--text-muted)',
				}}
			>
				{fileName} · {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}
			</div>
		</div>
	);
}

export default XlsxViewer;

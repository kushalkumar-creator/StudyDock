import ExcelJS from 'exceljs';
import { env } from '../config/env.js';

export interface ReservationExportRow {
  id: string;
  student_name: string;
  student_email: string;
  floor_name: string;
  section: string;
  seat_label: string;
  start_at: string;
  end_at: string;
  status: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: env.timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export async function generateReservationsExcel(rows: ReservationExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'StudyDock Library Management System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Reservations', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Booking ID', key: 'id', width: 38 },
    { header: 'Student Name', key: 'student_name', width: 22 },
    { header: 'Student Email', key: 'student_email', width: 28 },
    { header: 'Floor', key: 'floor_name', width: 28 },
    { header: 'Section', key: 'section', width: 18 },
    { header: 'Seat', key: 'seat_label', width: 14 },
    { header: 'Start Time', key: 'start_at', width: 22 },
    { header: 'End Time', key: 'end_at', width: 22 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Checked In', key: 'checked_in_at', width: 22 },
    { header: 'Checked Out', key: 'checked_out_at', width: 22 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1C60F1' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 24;

  for (const row of rows) {
    sheet.addRow({
      id: row.id,
      student_name: row.student_name,
      student_email: row.student_email,
      floor_name: row.floor_name,
      section: row.section,
      seat_label: row.seat_label,
      start_at: fmt(row.start_at),
      end_at: fmt(row.end_at),
      status: row.status.toUpperCase(),
      checked_in_at: fmt(row.checked_in_at),
      checked_out_at: fmt(row.checked_out_at),
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

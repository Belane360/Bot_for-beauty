// Mini booking app for Telegram

// Mapping of services to durations in minutes
const SERVICE_DURATIONS = {
  manicure: 60,
  pedicure: 60,
  combo: 120,
};

// Working hours (in minutes from midnight)
const WORK_START = 9 * 60; // 09:00
const WORK_END = 17 * 60; // 17:00
const SLOT_INTERVAL = 15; // 15 minutes

// DOM elements
const serviceSelect = document.getElementById('service-select');
const dateInput = document.getElementById('date-input');
const timeSelect = document.getElementById('time-select');
const bookButton = document.getElementById('book-button');
const confirmationDiv = document.getElementById('confirmation');
const bookingsList = document.getElementById('bookings-list');

// Load bookings from localStorage or initialize empty array
function loadBookings() {
  const stored = localStorage.getItem('bookings');
  return stored ? JSON.parse(stored) : [];
}

function saveBookings(bookings) {
  localStorage.setItem('bookings', JSON.stringify(bookings));
}

// Convert minutes to HH:MM format
function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Compute available slots for a given date and service
function getAvailableSlots(dateStr, service) {
  const bookings = loadBookings();
  const duration = SERVICE_DURATIONS[service];
  const dayBookings = bookings.filter(b => b.date === dateStr);
  const slots = [];
  for (let t = WORK_START; t <= WORK_END - duration; t += SLOT_INTERVAL) {
    // Check overlap with existing bookings
    const overlaps = dayBookings.some(b => {
      const start = b.start;
      const end = b.start + b.duration;
      const newStart = t;
      const newEnd = t + duration;
      return newStart < end && start < newEnd;
    });
    if (!overlaps) {
      slots.push(t);
    }
  }
  return slots;
}

// Update time options when service or date changes
function updateTimeOptions() {
  const service = serviceSelect.value;
  const date = dateInput.value;
  timeSelect.innerHTML = '';
  if (!service || !date) {
    const opt = document.createElement('option');
    opt.textContent = '-- выберите дату и услугу --';
    opt.value = '';
    timeSelect.appendChild(opt);
    bookButton.disabled = true;
    return;
  }
  const slots = getAvailableSlots(date, service);
  if (slots.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'Нет доступных временных окон';
    opt.value = '';
    timeSelect.appendChild(opt);
    bookButton.disabled = true;
    return;
  }
  const placeholder = document.createElement('option');
  placeholder.textContent = '-- выберите время --';
  placeholder.value = '';
  timeSelect.appendChild(placeholder);
  slots.forEach(minutes => {
    const opt = document.createElement('option');
    opt.value = minutes;
    opt.textContent = minutesToTime(minutes);
    timeSelect.appendChild(opt);
  });
  bookButton.disabled = true;
}

// Update book button state when time selected
function updateButtonState() {
  if (serviceSelect.value && dateInput.value && timeSelect.value) {
    bookButton.disabled = false;
  } else {
    bookButton.disabled = true;
  }
}

// Render bookings list
function renderBookings() {
  const bookings = loadBookings();
  bookingsList.innerHTML = '';
  if (bookings.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Нет записей.';
    bookingsList.appendChild(li);
    return;
  }
  bookings.sort((a, b) => {
    if (a.date === b.date) return a.start - b.start;
    return a.date.localeCompare(b.date);
  });
  bookings.forEach(b => {
    const li = document.createElement('li');
    const startTime = minutesToTime(b.start);
    const endTime = minutesToTime(b.start + b.duration);
    let serviceName;
    if (b.service === 'manicure') serviceName = 'Маникюр';
    else if (b.service === 'pedicure') serviceName = 'Педикюр';
    else serviceName = 'Маникюр + педикюр';
    li.textContent = `${b.date} • ${startTime}–${endTime} • ${serviceName}`;
    bookingsList.appendChild(li);
  });
}

// Event listeners
serviceSelect.addEventListener('change', () => {
  updateTimeOptions();
  updateButtonState();
});
dateInput.addEventListener('change', () => {
  updateTimeOptions();
  updateButtonState();
});
timeSelect.addEventListener('change', updateButtonState);

bookButton.addEventListener('click', () => {
  const service = serviceSelect.value;
  const date = dateInput.value;
  const start = parseInt(timeSelect.value, 10);
  const duration = SERVICE_DURATIONS[service];
  const booking = { service, date, start, duration };
  // Save booking
  const bookings = loadBookings();
  bookings.push(booking);
  saveBookings(bookings);
  renderBookings();
  // Show confirmation
  const startTime = minutesToTime(start);
  const endTime = minutesToTime(start + duration);
  let serviceName;
  if (service === 'manicure') serviceName = 'маникюр';
  else if (service === 'pedicure') serviceName = 'педикюр';
  else serviceName = 'маникюр + педикюр';
  confirmationDiv.textContent = `Вы записаны на ${serviceName} ${date} с ${startTime} до ${endTime}.`;
  confirmationDiv.classList.remove('hidden');
  // Reset inputs
  serviceSelect.value = '';
  dateInput.value = '';
  updateTimeOptions();
  updateButtonState();
  // If running inside Telegram Web App, send data back
  if (window.Telegram && window.Telegram.WebApp) {
    try {
      window.Telegram.WebApp.sendData(JSON.stringify(booking));
    } catch (err) {
      console.error('Error sending data to Telegram bot:', err);
    }
  }
});

// Initialize
function init() {
  // Pre-fill date with today
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;
  updateTimeOptions();
  renderBookings();
}

init();
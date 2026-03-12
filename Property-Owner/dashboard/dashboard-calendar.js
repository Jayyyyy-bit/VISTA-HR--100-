(() => {
    const state = {
        current: new Date(),
        selectedDate: null,
        activePopoverDate: null,
        inspectedBookingId: null,
        monthPickerOpen: false,
        bookings: [
            {
                id: 1,
                guest: "Angela Cruz",
                listing: "Condo Unit 1",
                start: "2026-03-12",
                end: "2026-04-12",
                status: "confirmed",
                image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1200&auto=format&fit=crop"
            },
            {
                id: 2,
                guest: "Mark Santos",
                listing: "Studio Apartment A",
                start: "2026-03-18",
                end: "2026-05-18",
                status: "pending",
                image: "https://images.unsplash.com/photo-1494526585095-c41746248156?q=80&w=1200&auto=format&fit=crop"
            },
            {
                id: 3,
                guest: "Paolo Reyes",
                listing: "Room 3B",
                start: "2026-03-20",
                end: "2026-04-20",
                status: "cancelled",
                image: "https://images.unsplash.com/photo-1484154218962-a197022b5858?q=80&w=1200&auto=format&fit=crop"
            }
        ]
    };

    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    function escapeHtml(str) {
        return String(str || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function fmtMonth(date) {
        return date.toLocaleDateString([], { month: "long", year: "numeric" });
    }

    function fmtLong(dateStr) {
        const d = new Date(dateStr + "T00:00:00");
        return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    }

    function toYMD(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    function bookingsForDate(dateStr) {
        return state.bookings.filter((b) => dateStr >= b.start && dateStr <= b.end);
    }

    function getBookingById(id) {
        return state.bookings.find((b) => String(b.id) === String(id)) || null;
    }

    function statusLabel(status) {
        if (status === "confirmed") return "Moved in";
        if (status === "pending") return "Reserved";
        if (status === "cancelled") return "Move out";
        return status;
    }

    function eventBarsForDate(dateStr) {
        const bars = [];

        for (const item of state.bookings) {
            if (item.status === "pending") {
                if (dateStr >= item.start && dateStr <= item.end) {
                    bars.push({
                        cls: "isPending",
                        label: dateStr === item.start ? "Reserved" : "Pending"
                    });
                }
                continue;
            }

            if (item.status === "confirmed") {
                if (dateStr === item.start) {
                    bars.push({
                        cls: "isConfirmed",
                        label: "Moved in"
                    });
                } else if (dateStr === item.end) {
                    bars.push({
                        cls: "isCancelled",
                        label: "Move out"
                    });
                } else if (dateStr > item.start && dateStr < item.end) {
                    bars.push({
                        cls: "isOccupied",
                        label: "Occupied"
                    });
                }
                continue;
            }

            if (item.status === "cancelled") {
                if (dateStr === item.end) {
                    bars.push({
                        cls: "isCancelled",
                        label: "Move out"
                    });
                }
            }
        }

        const priority = {
            isConfirmed: 1,
            isOccupied: 2,
            isPending: 3,
            isCancelled: 4
        };

        bars.sort((a, b) => (priority[a.cls] || 99) - (priority[b.cls] || 99));

        return bars;
    }

    function renderWeekdays() {
        const el = document.getElementById("calendarWeekdays");
        if (!el) return;
        el.innerHTML = WEEKDAYS.map((d) => `<div class="calendarWeekday">${d}</div>`).join("");
    }

    function renderGrid() {
        const monthLabel = document.getElementById("calendarMonthLabel");
        const grid = document.getElementById("calendarGrid");
        if (!grid) return;

        const year = state.current.getFullYear();
        const month = state.current.getMonth();

        if (monthLabel) monthLabel.textContent = fmtMonth(state.current);

        const firstDay = new Date(year, month, 1);
        const startWeekday = firstDay.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const cells = [];

        for (let i = 0; i < startWeekday; i++) {
            cells.push(`<div class="calendarDay isEmpty"></div>`);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            const ymd = toYMD(d);
            const dayBookings = bookingsForDate(ymd);
            const bars = eventBarsForDate(ymd);
            const visibleBars = bars.slice(0, 2);
            const hiddenCount = Math.max(0, bars.length - visibleBars.length);


            const selected = state.selectedDate === ymd ? "isSelected" : "";
            const today = toYMD(new Date()) === ymd ? "isToday" : "";
            const active = state.activePopoverDate === ymd ? "isActive" : "";

            const barMarkup = `
            ${visibleBars.map((bar) => `
          <span class="calendarMiniBar ${bar.cls}">${bar.label}</span>
         `).join("")}
           ${hiddenCount > 0 ? `<span class="calendarMiniMore">+${hiddenCount} more</span>` : ""}
          `;

            const summary = dayBookings.length
                ? `<span class="calendarDayCount">${dayBookings.length} stay${dayBookings.length > 1 ? "s" : ""}</span>`
                : `<span class="calendarDayCount isMuted">Available</span>`;

            cells.push(`
                <button class="calendarDay ${selected} ${today} ${active}" type="button" data-date="${ymd}">
                    <span class="calendarDayNum">${day}</span>
                    <span class="calendarMiniBars">${barMarkup}</span>
                    ${summary}
                </button>
            `);
        }

        grid.innerHTML = cells.join("");
        grid.classList.toggle("hasActivePopover", !!state.activePopoverDate);

        grid.querySelectorAll(".calendarDay[data-date]").forEach((btn) => {
            btn.addEventListener("click", () => {
                const clickedDate = btn.dataset.date;

                state.selectedDate = clickedDate;
                state.activePopoverDate = state.activePopoverDate === clickedDate ? null : clickedDate;

                renderGrid();
                renderBookings();

                if (state.activePopoverDate === clickedDate) {
                    requestAnimationFrame(() => {
                        showCalendarPopover(clickedDate);
                    });
                }
            });

            btn.addEventListener("dblclick", (e) => {
                e.preventDefault();
                state.selectedDate = null;
                state.activePopoverDate = null;
                removeCalendarPopover();
                renderGrid();
                renderBookings();
            });
        });

        if (state.activePopoverDate) {
            requestAnimationFrame(() => {
                showCalendarPopover(state.activePopoverDate);
            });
        }
    }

    function removeCalendarPopover() {
        document.querySelector(".calendarEventPopover")?.remove();
    }

    function showCalendarPopover(dateStr) {
        removeCalendarPopover();

        const grid = document.getElementById("calendarGrid");
        const mainCard = document.querySelector(".calendarMainCard");
        const target = grid?.querySelector(`.calendarDay[data-date="${dateStr}"]`);
        if (!grid || !mainCard || !target) return;

        const items = bookingsForDate(dateStr);
        if (!items.length) return;

        const pop = document.createElement("div");
        pop.className = "calendarEventPopover";

        pop.innerHTML = `
            <div class="calendarEventPopoverInner">
                ${items.slice(0, 2).map((item) => `
                    <div class="calendarEventCard"
                         draggable="true"
                         data-booking-id="${escapeHtml(item.id)}"
                         title="Drag to the right panel for full details">
                        <div class="calendarEventThumbWrap">
                            <img class="calendarEventThumb" src="${escapeHtml(item.image || "")}" alt="${escapeHtml(item.listing)}">
                        </div>
                        <div class="calendarEventBody">
                            <div class="calendarEventStatus ${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</div>
                            <div class="calendarEventGuest">${escapeHtml(item.guest)}</div>
                            <div class="calendarEventListing">${escapeHtml(item.listing)}</div>
                            <div class="calendarEventDates">
                                ${escapeHtml(fmtLong(item.start))} → ${escapeHtml(fmtLong(item.end))}
                            </div>
                            <div class="calendarEventHint">Drag to right panel</div>
                        </div>
                    </div>
                `).join("")}
                ${items.length > 2 ? `<div class="calendarEventMore">+${items.length - 2} more on this date</div>` : ""}
            </div>
        `;

        mainCard.appendChild(pop);

        pop.querySelectorAll(".calendarEventCard[draggable='true']").forEach((card) => {
            card.addEventListener("dragstart", (e) => {
                const bookingId = card.dataset.bookingId;
                e.dataTransfer.setData("text/plain", bookingId || "");
                document.getElementById("calendarSidePanel")?.classList.add("isDropTarget");
            });

            card.addEventListener("dragend", () => {
                document.getElementById("calendarSidePanel")?.classList.remove("isDropTarget");
            });
        });

        const targetRect = target.getBoundingClientRect();
        const hostRect = mainCard.getBoundingClientRect();

        const top = targetRect.top - hostRect.top + mainCard.scrollTop + 6;
        let left = targetRect.left - hostRect.left + mainCard.scrollLeft + targetRect.width + 12;

        pop.style.top = `${top}px`;
        pop.style.left = `${left}px`;

        const popRect = pop.getBoundingClientRect();
        const mainRect = mainCard.getBoundingClientRect();

        if (popRect.right > mainRect.right - 12) {
            left = targetRect.left - hostRect.left + mainCard.scrollLeft - popRect.width - 12;
            pop.style.left = `${Math.max(12, left)}px`;
        }

        const adjustedRect = pop.getBoundingClientRect();
        if (adjustedRect.bottom > mainRect.bottom - 12) {
            const newTop = top - (adjustedRect.bottom - mainRect.bottom) - 16;
            pop.style.top = `${Math.max(12, newTop)}px`;
        }

        requestAnimationFrame(() => {
            pop.classList.add("isVisible");
        });
    }

    function showInspectorOverview() {
        const overview = document.getElementById("calendarInspectorOverview");
        const detail = document.getElementById("calendarInspectorDetail");
        if (!overview || !detail) return;

        state.inspectedBookingId = null;
        overview.hidden = false;
        detail.hidden = true;
        detail.innerHTML = "";
    }

    function renderInspectorDetail(bookingId) {
        const booking = getBookingById(bookingId);
        const overview = document.getElementById("calendarInspectorOverview");
        const detail = document.getElementById("calendarInspectorDetail");
        if (!booking || !overview || !detail) return;

        state.inspectedBookingId = booking.id;
        overview.hidden = true;
        detail.hidden = false;

        detail.innerHTML = `
            <div class="calendarSideCard calendarDetailCard">
                <div class="calendarDetailTop">
                    <button type="button" class="calendarDetailBackBtn" id="calendarDetailBackBtn">← Back</button>
                </div>

                <div class="calendarDetailImageWrap">
                    <img class="calendarDetailImage" src="${escapeHtml(booking.image || "")}" alt="${escapeHtml(booking.listing)}">
                </div>

                <div class="calendarDetailStatus ${escapeHtml(booking.status)}">
                    ${escapeHtml(statusLabel(booking.status))}
                </div>

                <div class="calendarDetailGuest">${escapeHtml(booking.guest)}</div>
                <div class="calendarDetailListing">${escapeHtml(booking.listing)}</div>

                <div class="calendarDetailInfoList">
                    <div class="calendarDetailInfoRow">
                        <span>Move-in</span>
                        <strong>${escapeHtml(fmtLong(booking.start))}</strong>
                    </div>
                    <div class="calendarDetailInfoRow">
                        <span>Scheduled move-out</span>
                        <strong>${escapeHtml(fmtLong(booking.end))}</strong>
                    </div>
                    <div class="calendarDetailInfoRow">
                        <span>Status</span>
                        <strong>${escapeHtml(statusLabel(booking.status))}</strong>
                    </div>
                </div>
            </div>
        `;

        detail.querySelector("#calendarDetailBackBtn")?.addEventListener("click", () => {
            showInspectorOverview();
        });
    }

    function renderBookings() {
        const label = document.getElementById("calendarSelectedDate");
        const meta = document.getElementById("calendarSelectedMeta");
        const availability = document.getElementById("calendarAvailabilityStatus");

        if (!label) return;

        if (!state.selectedDate) {
            label.textContent = "Select a date";
            if (meta) meta.textContent = "Choose a day to view rental activity.";
            if (availability) availability.textContent = "Available";
            return;
        }

        const items = bookingsForDate(state.selectedDate);
        label.textContent = fmtLong(state.selectedDate);

        if (items.length) {
            if (meta) meta.textContent = `${items.length} active stay${items.length > 1 ? "s" : ""} on this date.`;
            if (availability) availability.textContent = "Occupied";
        } else {
            if (meta) meta.textContent = "No active stays on this date.";
            if (availability) availability.textContent = "Available";
        }
    }

    function renderMonthPicker() {
        const wrap = document.getElementById("calendarMonthPicker");
        if (!wrap) return;

        if (!state.monthPickerOpen) {
            wrap.hidden = true;
            wrap.innerHTML = "";
            return;
        }

        const currentYear = state.current.getFullYear();

        wrap.hidden = false;
        wrap.innerHTML = `
            <div class="calendarMonthPickerCard">
                <div class="calendarMonthPickerHead">
                    <button type="button" class="calendarMonthNavBtn" data-year-shift="-1">‹</button>
                    <div class="calendarMonthPickerYear">${currentYear}</div>
                    <button type="button" class="calendarMonthNavBtn" data-year-shift="1">›</button>
                </div>
                <div class="calendarMonthGrid">
                    ${MONTHS.map((month, index) => `
                        <button
                            type="button"
                            class="calendarMonthItem ${index === state.current.getMonth() ? "isCurrent" : ""}"
                            data-month-index="${index}">
                            ${month.slice(0, 3)}
                        </button>
                    `).join("")}
                </div>
            </div>
        `;

        wrap.querySelectorAll(".calendarMonthItem").forEach((btn) => {
            btn.addEventListener("click", () => {
                const monthIndex = Number(btn.dataset.monthIndex);
                state.current = new Date(currentYear, monthIndex, 1);
                state.monthPickerOpen = false;
                render();
            });
        });

        wrap.querySelectorAll(".calendarMonthNavBtn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const shift = Number(btn.dataset.yearShift || 0);
                state.current = new Date(currentYear + shift, state.current.getMonth(), 1);
                renderMonthPicker();
                renderGrid();
            });
        });
    }

    function bindControls() {
        document.getElementById("calPrevBtn")?.addEventListener("click", () => {
            state.current = new Date(state.current.getFullYear(), state.current.getMonth() - 1, 1);
            state.monthPickerOpen = false;
            renderGrid();
            renderMonthPicker();
        });

        document.getElementById("calNextBtn")?.addEventListener("click", () => {
            state.current = new Date(state.current.getFullYear(), state.current.getMonth() + 1, 1);
            state.monthPickerOpen = false;
            renderGrid();
            renderMonthPicker();
        });

        document.getElementById("calTodayBtn")?.addEventListener("click", () => {
            state.current = new Date();
            state.selectedDate = toYMD(new Date());
            state.monthPickerOpen = false;
            renderGrid();
            renderBookings();
            renderMonthPicker();
        });

        document.getElementById("calendarMonthLabel")?.addEventListener("click", () => {
            state.monthPickerOpen = !state.monthPickerOpen;
            renderMonthPicker();
        });
    }

    function bindOutsideClose() {
        document.addEventListener("click", (e) => {
            const insideDay = e.target.closest(".calendarDay");
            const insidePopover = e.target.closest(".calendarEventPopover");
            const insideMonthPicker = e.target.closest(".calendarMonthPicker");
            const monthLabel = e.target.closest("#calendarMonthLabel");

            if (!insideDay && !insidePopover) {
                state.activePopoverDate = null;
                removeCalendarPopover();
                renderGrid();
            }

            if (!insideMonthPicker && !monthLabel && state.monthPickerOpen) {
                state.monthPickerOpen = false;
                renderMonthPicker();
            }
        });
    }

    function bindInspectorDropzone() {
        const panel = document.getElementById("calendarSidePanel");
        if (!panel) return;

        panel.addEventListener("dragover", (e) => {
            e.preventDefault();
            panel.classList.add("isDropTarget");
        });

        panel.addEventListener("dragleave", (e) => {
            if (!panel.contains(e.relatedTarget)) {
                panel.classList.remove("isDropTarget");
            }
        });

        panel.addEventListener("drop", (e) => {
            e.preventDefault();
            panel.classList.remove("isDropTarget");

            const bookingId = e.dataTransfer.getData("text/plain");
            if (!bookingId) return;

            renderInspectorDetail(bookingId);
        });
    }

    let hasBoundControls = false;
    let hasBoundOutside = false;
    let hasBoundDropzone = false;

    function render() {
        renderWeekdays();
        renderGrid();
        renderBookings();
        renderMonthPicker();

        if (!hasBoundControls) {
            bindControls();
            hasBoundControls = true;
        }

        if (!hasBoundOutside) {
            bindOutsideClose();
            hasBoundOutside = true;
        }

        if (!hasBoundDropzone) {
            bindInspectorDropzone();
            hasBoundDropzone = true;
        }
    }

    window.DashboardCalendar = { render, showInspectorOverview };
})();
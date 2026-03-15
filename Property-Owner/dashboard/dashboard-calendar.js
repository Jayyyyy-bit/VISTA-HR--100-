(() => {
    const STATUS = {
        AVAILABLE: "AVAILABLE",
        RESERVED: "RESERVED",
        MOVED_IN: "MOVED_IN",
        OCCUPIED: "OCCUPIED",
        MOVE_OUT: "MOVE_OUT"
    };

    const state = {
        current: new Date(),
        selectedDate: null,
        activePopoverDate: null,
        inspectedBookingId: null,
        monthPickerOpen: false,
        unitFilter: "all",
        statusFilter: "all",
        bookings: [
            {
                id: 1,
                guest: "Angela Cruz",
                listing: "Condo Unit 1",
                unit: "Condo Unit 1",
                start: "2026-03-12",
                end: "2026-04-12",
                status: STATUS.MOVED_IN,
                image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?q=80&w=1200&auto=format&fit=crop"
            },
            {
                id: 2,
                guest: "Mark Santos",
                listing: "Studio Apartment A",
                unit: "Studio Apartment A",
                start: "2026-03-18",
                end: "2026-05-18",
                status: STATUS.RESERVED,
                image: "https://images.unsplash.com/photo-1494526585095-c41746248156?q=80&w=1200&auto=format&fit=crop"
            },
            {
                id: 3,
                guest: "Paolo Reyes",
                listing: "Room 3B",
                unit: "Room 3B",
                start: "2026-03-20",
                end: "2026-04-20",
                status: STATUS.MOVE_OUT,
                image: "https://images.unsplash.com/photo-1484154218962-a197022b5858?q=80&w=1200&auto=format&fit=crop"
            },
            {
                id: 4,
                guest: "Denise Lim",
                listing: "Condo Unit 1",
                unit: "Condo Unit 1",
                start: "2026-03-28",
                end: "2026-05-01",
                status: STATUS.RESERVED,
                image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?q=80&w=1200&auto=format&fit=crop"
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

    function todayYMD() {
        return toYMD(new Date());
    }

    function statusLabel(status) {
        if (status === STATUS.RESERVED) return "Reserved";
        if (status === STATUS.MOVED_IN) return "Moved in";
        if (status === STATUS.OCCUPIED) return "Occupied";
        if (status === STATUS.MOVE_OUT) return "Move out";
        return "Available";
    }

    function getDerivedStatus(item, dateStr) {
        if (item.status === STATUS.RESERVED) return STATUS.RESERVED;

        if (item.status === STATUS.MOVE_OUT) {
            return dateStr === item.end ? STATUS.MOVE_OUT : STATUS.RESERVED;
        }

        if (item.status === STATUS.MOVED_IN) {
            if (dateStr === item.start) return STATUS.MOVED_IN;
            if (dateStr === item.end) return STATUS.MOVE_OUT;
            if (dateStr > item.start && dateStr < item.end) return STATUS.OCCUPIED;
            return STATUS.MOVED_IN;
        }

        return item.status || STATUS.AVAILABLE;
    }

    function matchesFilters(item, dateStr) {
        const sameUnit = state.unitFilter === "all" || item.unit === state.unitFilter;
        if (!sameUnit) return false;

        if (state.statusFilter === "all") return true;

        const derived = getDerivedStatus(item, dateStr);
        return derived === state.statusFilter;
    }

    function bookingsForDate(dateStr) {
        return state.bookings.filter((item) => {
            const active = dateStr >= item.start && dateStr <= item.end;
            return active && matchesFilters(item, dateStr);
        });
    }

    function getBookingById(id) {
        return state.bookings.find((item) => String(item.id) === String(id)) || null;
    }

    function getUnits() {
        return [...new Set(state.bookings.map((item) => item.unit).filter(Boolean))].sort();
    }

    function dateEventsForUnit(unit, dateStr) {
        return state.bookings.filter((item) => item.unit === unit && dateStr >= item.start && dateStr <= item.end);
    }

    function getConflictsForDate(dateStr) {
        const warnings = [];

        for (const unit of getUnits()) {
            const entries = dateEventsForUnit(unit, dateStr);
            if (entries.length > 1) {
                warnings.push({
                    type: "overlap",
                    title: `Overlap detected in ${unit}`,
                    meta: `${entries.length} stays fall on ${fmtLong(dateStr)}. Review for possible double booking.`
                });
            }
        }

        return warnings;
    }

    function eventBarsForDate(dateStr) {
        const bars = bookingsForDate(dateStr).map((item) => {
            const derived = getDerivedStatus(item, dateStr);

            return {
                id: item.id,
                status: derived,
                cls: statusToBarClass(derived),
                label: statusLabel(derived)
            };
        });

        const priority = {
            MOVE_OUT: 1,
            MOVED_IN: 2,
            OCCUPIED: 3,
            RESERVED: 4
        };

        bars.sort((a, b) => (priority[a.status] || 99) - (priority[b.status] || 99));
        return bars;
    }

    function statusToBarClass(status) {
        if (status === STATUS.RESERVED) return "isReserved";
        if (status === STATUS.MOVED_IN) return "isMovedIn";
        if (status === STATUS.OCCUPIED) return "isOccupied";
        if (status === STATUS.MOVE_OUT) return "isMoveOut";
        return "isAvailable";
    }

    function monthDateRange() {
        const year = state.current.getFullYear();
        const month = state.current.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        return Array.from({ length: daysInMonth }, (_, i) => {
            return toYMD(new Date(year, month, i + 1));
        });
    }

    function renderWeekdays() {
        const el = document.getElementById("calendarWeekdays");
        if (!el) return;
        el.innerHTML = WEEKDAYS.map((d) => `<div class="calendarWeekday">${d}</div>`).join("");
    }


    function renderMiniCalendar() {
        const grid = document.getElementById("calendarMiniGrid");
        if (!grid) return;

        const year = state.current.getFullYear();
        const month = state.current.getMonth();
        const firstDay = new Date(year, month, 1);
        const startWeekday = firstDay.getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const todayStr = todayYMD();

        const dows = ["S", "M", "T", "W", "T", "F", "S"];
        let html = dows.map(d => `<div class="calendarMiniDow">${d}</div>`).join("");

        for (let i = 0; i < startWeekday; i++) {
            html += `<div class="calendarMiniDay isEmpty"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(year, month, day);
            const ymd = toYMD(d);
            const isToday = ymd === todayStr ? "isToday" : "";
            const isSelected = ymd === state.selectedDate ? "isSelected" : "";
            const hasEvents = bookingsForDate(ymd).length > 0 ? "hasEvents" : "";
            html += `<div class="calendarMiniDay ${isToday} ${isSelected} ${hasEvents}" data-mini-date="${ymd}">${day}</div>`;
        }

        grid.innerHTML = html;

        grid.querySelectorAll(".calendarMiniDay[data-mini-date]").forEach(el => {
            el.addEventListener("click", () => {
                const clickedDate = el.dataset.miniDate;
                state.selectedDate = clickedDate;
                state.activePopoverDate = null;
                removeCalendarPopover();
                renderGrid();
                renderMiniCalendar();
                renderInspectorOverview();
                renderSummary();
            });
        });
    }

    function renderUnitFilter() {
        const select = document.getElementById("calendarUnitFilter");
        if (!select) return;

        const currentValue = state.unitFilter;
        const options = [
            `<option value="all">All units</option>`,
            ...getUnits().map((unit) => `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`)
        ];

        select.innerHTML = options.join("");
        select.value = currentValue;
    }

    function renderSummary() {
        const visibleMonthDates = monthDateRange();
        const todaysDate = todayYMD();

        const allVisibleEvents = visibleMonthDates.flatMap((dateStr) => bookingsForDate(dateStr).map((item) => ({
            item,
            dateStr,
            derived: getDerivedStatus(item, dateStr)
        })));

        const reservedCount = allVisibleEvents.filter((x) => x.derived === STATUS.RESERVED).length;
        const occupiedCount = allVisibleEvents.filter((x) =>
            x.derived === STATUS.OCCUPIED || x.derived === STATUS.MOVED_IN
        ).length;

        const moveInToday = bookingsForDate(todaysDate).filter((x) => getDerivedStatus(x, todaysDate) === STATUS.MOVED_IN).length;
        const moveOutToday = bookingsForDate(todaysDate).filter((x) => getDerivedStatus(x, todaysDate) === STATUS.MOVE_OUT).length;

        const totalUnits = getUnits().length || 0;
        const occupiedUnitsToday = new Set(
            bookingsForDate(todaysDate)
                .filter((x) => {
                    const derived = getDerivedStatus(x, todaysDate);
                    return derived === STATUS.OCCUPIED || derived === STATUS.MOVED_IN;
                })
                .map((x) => x.unit)
        ).size;

        const availableToday = Math.max(0, totalUnits - occupiedUnitsToday);

        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(value);
        };

        setText("summaryAvailable", availableToday);
        setText("summaryReserved", reservedCount);
        setText("summaryOccupied", occupiedCount);
        setText("summaryMoveIn", moveInToday);
        setText("summaryMoveOut", moveOutToday);
    }

    function renderGrid() {
        const monthLabel = document.getElementById("calendarMonthLabel");
        const grid = document.getElementById("calendarGrid");
        if (!grid) return;

        const year = state.current.getFullYear();
        const month = state.current.getMonth();

        if (monthLabel) monthLabel.textContent = fmtMonth(state.current);
        renderMiniCalendar();

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
            const visibleBars = bars.slice(0, 3);
            const hiddenCount = Math.max(0, bars.length - visibleBars.length);
            const conflictCount = getConflictsForDate(ymd).length;

            const selected = state.selectedDate === ymd ? "isSelected" : "";
            const today = todayYMD() === ymd ? "isToday" : "";
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
                    ${conflictCount ? `<span class="calendarConflictBadge">${conflictCount}</span>` : ""}
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
                renderInspectorOverview();
                renderSummary();

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
                renderInspectorOverview();
                renderGrid();
                renderSummary();
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
                ${items.slice(0, 2).map((item) => {
            const derived = getDerivedStatus(item, dateStr);
            return `
                        <div class="calendarEventCard"
                             draggable="true"
                             data-booking-id="${escapeHtml(item.id)}"
                             title="Drag to the right panel for full details">
                            <div class="calendarEventThumbWrap">
                                <img class="calendarEventThumb" src="${escapeHtml(item.image || "")}" alt="${escapeHtml(item.listing)}">
                            </div>
                            <div class="calendarEventBody">
                                <div class="calendarEventStatus ${escapeHtml(derived)}">${escapeHtml(statusLabel(derived))}</div>
                                <div class="calendarEventGuest">${escapeHtml(item.guest)}</div>
                                <div class="calendarEventListing">${escapeHtml(item.listing)}</div>
                                <div class="calendarEventDates">
                                    ${escapeHtml(fmtLong(item.start))} → ${escapeHtml(fmtLong(item.end))}
                                </div>
                                <div class="calendarEventHint">Drag to right panel</div>
                            </div>
                        </div>
                    `;
        }).join("")}
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

    function renderDetailInspector(bookingId) {
        const booking = getBookingById(bookingId);
        const overview = document.getElementById("calendarInspectorOverview");
        const detail = document.getElementById("calendarInspectorDetail");
        if (!booking || !overview || !detail) return;

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
                        <span>Unit</span>
                        <strong>${escapeHtml(booking.unit)}</strong>
                    </div>
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
            detail.hidden = true;
            overview.hidden = false;
        });
    }

    function renderDayEvents(items) {
        const el = document.getElementById("calendarDayEvents");
        if (!el) return;

        if (!items.length) {
            el.innerHTML = `<div class="calendarEmptyNote">No stays on this date.</div>`;
            return;
        }

        el.innerHTML = items.map((item) => {
            const derived = getDerivedStatus(item, state.selectedDate);
            return `
                <button class="calendarListCard" type="button" data-open-booking="${escapeHtml(item.id)}">
                    <div class="calendarListCardHead">
                        <div class="calendarListTitle">${escapeHtml(item.guest)}</div>
                        <span class="calendarStatusChip ${escapeHtml(derived)}">${escapeHtml(statusLabel(derived))}</span>
                    </div>
                    <div class="calendarListMeta">
                        ${escapeHtml(item.unit)}<br>
                        ${escapeHtml(fmtLong(item.start))} → ${escapeHtml(fmtLong(item.end))}
                    </div>
                </button>
            `;
        }).join("");

        el.querySelectorAll("[data-open-booking]").forEach((btn) => {
            btn.addEventListener("click", () => {
                renderDetailInspector(btn.dataset.openBooking);
            });
        });
    }

    function renderWarnings(dateStr) {
        const el = document.getElementById("calendarWarnings");
        if (!el) return;

        const warnings = getConflictsForDate(dateStr);

        if (!warnings.length) {
            el.innerHTML = `<div class="calendarEmptyNote">No conflicts detected.</div>`;
            return;
        }

        el.innerHTML = warnings.map((warning) => `
            <div class="calendarListCard isWarning">
                <div class="calendarListTitle">${escapeHtml(warning.title)}</div>
                <div class="calendarListMeta">${escapeHtml(warning.meta)}</div>
            </div>
        `).join("");
    }

    function renderUpcomingActions(dateStr) {
        const el = document.getElementById("calendarUpcomingActions");
        if (!el) return;

        const nextDay = new Date(dateStr + "T00:00:00");
        nextDay.setDate(nextDay.getDate() + 1);
        const nextYmd = toYMD(nextDay);

        const actions = [];

        for (const item of state.bookings) {
            if (state.unitFilter !== "all" && item.unit !== state.unitFilter) continue;

            if (item.start === nextYmd) {
                actions.push({
                    title: `${item.guest} starts tomorrow`,
                    meta: `${item.unit} • ${statusLabel(STATUS.MOVED_IN)}`
                });
            }

            if (item.end === nextYmd) {
                actions.push({
                    title: `${item.guest} moves out tomorrow`,
                    meta: `${item.unit} • ${statusLabel(STATUS.MOVE_OUT)}`
                });
            }
        }

        if (!actions.length) {
            el.innerHTML = `<div class="calendarEmptyNote">No upcoming actions for this selection.</div>`;
            return;
        }

        el.innerHTML = actions.map((action) => `
            <div class="calendarListCard">
                <div class="calendarListTitle">${escapeHtml(action.title)}</div>
                <div class="calendarListMeta">${escapeHtml(action.meta)}</div>
            </div>
        `).join("");
    }

    function renderInspectorOverview() {
        const overview = document.getElementById("calendarInspectorOverview");
        const detail = document.getElementById("calendarInspectorDetail");

        if (detail) {
            detail.hidden = true;
            detail.innerHTML = "";
        }

        if (overview) {
            overview.hidden = false;
        }

        const label = document.getElementById("calendarSelectedDate");
        const meta = document.getElementById("calendarSelectedMeta");
        const availability = document.getElementById("calendarAvailabilityStatus");
        const total = document.getElementById("calendarDailyTotal");
        const reserved = document.getElementById("calendarDailyReserved");
        const occupied = document.getElementById("calendarDailyOccupied");

        if (!label) return;

        if (!state.selectedDate) {
            label.textContent = "Select a date";
            if (meta) meta.textContent = "Choose a day to view rental activity.";
            if (availability) availability.textContent = "Available";
            if (total) total.textContent = "0";
            if (reserved) reserved.textContent = "0";
            if (occupied) occupied.textContent = "0";

            renderDayEvents([]);
            const warningsEl = document.getElementById("calendarWarnings");
            const upcomingEl = document.getElementById("calendarUpcomingActions");
            if (warningsEl) warningsEl.innerHTML = `<div class="calendarEmptyNote">No conflicts detected.</div>`;
            if (upcomingEl) upcomingEl.innerHTML = `<div class="calendarEmptyNote">No upcoming actions for this selection.</div>`;
            return;
        }

        const items = bookingsForDate(state.selectedDate);
        const reservedCount = items.filter((item) => getDerivedStatus(item, state.selectedDate) === STATUS.RESERVED).length;
        const occupiedCount = items.filter((item) => {
            const derived = getDerivedStatus(item, state.selectedDate);
            return derived === STATUS.MOVED_IN || derived === STATUS.OCCUPIED || derived === STATUS.MOVE_OUT;
        }).length;

        label.textContent = fmtLong(state.selectedDate);

        if (items.length) {
            if (meta) meta.textContent = `${items.length} active stay${items.length > 1 ? "s" : ""} on this date.`;
            if (availability) availability.textContent = "Occupied";
        } else {
            if (meta) meta.textContent = "No active stays on this date.";
            if (availability) availability.textContent = "Available";
        }

        if (total) total.textContent = String(items.length);
        if (reserved) reserved.textContent = String(reservedCount);
        if (occupied) occupied.textContent = String(occupiedCount);

        renderDayEvents(items);
        renderWarnings(state.selectedDate);
        renderUpcomingActions(state.selectedDate);
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
                renderSummary();
            });
        });
    }

    function bindControls() {
        document.getElementById("calPrevBtn")?.addEventListener("click", () => {
            state.current = new Date(state.current.getFullYear(), state.current.getMonth() - 1, 1);
            state.monthPickerOpen = false;
            renderGrid();
            renderMonthPicker();
            renderSummary();
        });

        document.getElementById("calNextBtn")?.addEventListener("click", () => {
            state.current = new Date(state.current.getFullYear(), state.current.getMonth() + 1, 1);
            state.monthPickerOpen = false;
            renderGrid();
            renderMonthPicker();
            renderSummary();
        });

        document.getElementById("calTodayBtn")?.addEventListener("click", () => {
            state.current = new Date();
            state.selectedDate = todayYMD();
            state.monthPickerOpen = false;
            render();
        });

        document.getElementById("calendarMonthLabel")?.addEventListener("click", () => {
            state.monthPickerOpen = !state.monthPickerOpen;
            renderMonthPicker();
        });

        document.getElementById("calendarUnitFilter")?.addEventListener("change", (e) => {
            state.unitFilter = e.target.value;
            state.activePopoverDate = null;
            removeCalendarPopover();
            render();
        });

        document.getElementById("calendarStatusFilter")?.addEventListener("change", (e) => {
            state.statusFilter = e.target.value;
            state.activePopoverDate = null;
            removeCalendarPopover();
            render();
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

            renderDetailInspector(bookingId);
        });
    }

    let hasBoundControls = false;
    let hasBoundOutside = false;
    let hasBoundDropzone = false;

    function render() {
        renderWeekdays();
        renderMiniCalendar();
        renderUnitFilter();
        renderGrid();
        renderInspectorOverview();
        renderSummary();
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

    window.DashboardCalendar = { render };
})();
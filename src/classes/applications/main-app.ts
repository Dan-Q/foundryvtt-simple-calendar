import {Logger} from "../logging";
import type Month from "../calendar/month";
import type Day from "../calendar/day";
import {
    AppPosition,
    NoteTemplate,
    SCRenderer,
    SearchOptions,
    SimpleCalendarSocket,
    SimpleCalendarTemplate
} from "../../interfaces";
import {GameSettings} from "../foundry-interfacing/game-settings";
import {NotesApp} from "./notes-app";
import {
    CalendarClickEvents,
    DateTimeUnits,
    GameWorldTimeIntegrations,
    SettingNames,
    SocketTypes,
    Themes,
    TimeKeeperStatus
} from "../../constants";
import {ConfigurationApp} from "./configuration-app";
import GameSockets from "../foundry-interfacing/game-sockets";
import Renderer from "../renderer";
import {animateElement} from "../utilities/visual";
import {CalManager, SC} from "../index";
import {FormatDateTime} from "../utilities/date-time";


/**
 * Contains all functionality for displaying/updating the simple calendar
 */
export default class MainApp extends Application{
    /**
     * Gets the current active calendar
     */
    private get activeCalendar(){
        return CalManager.getActiveCalendar();
    }
    /**
     * The CSS class associated with the animated clock
     */
    clockClass = 'stopped';
    /**
     * If the dialog has been resized
     * @type {boolean}
     */
    hasBeenResized: boolean = false;


    uiElementStates = {
        calendarDrawerOpen: false,
        compactView: false,
        dateTimeUnitOpen: false,
        dateTimeUnit: DateTimeUnits.Day,
        dateTimeUnitText: 'FSC.Day',
        noteDrawerOpen: false,
        searchDrawerOpen: false,
        searchOptionsOpen: false,
        calendarListOpen: false,

    };

    search = {
        term: '',
        results: <NoteTemplate[]>[],
        options: {
            fields: <SearchOptions.Fields>{
                date: true,
                title: true,
                details: true,
                author: true,
                categories: true
            }
        }
    };
    /**
     * Simple Calendar constructor
     */
    constructor() {
        super();
    }

    /**
     * Returns the default options for this application
     */
    static get defaultOptions() {
        const options = super.defaultOptions;
        options.template = "modules/foundryvtt-simple-calendar/templates/main.html";
        options.title = "FSC.Title";
        options.classes = ["simple-calendar", "dark"];
        options.id = "simple-calendar-application"
        options.resizable = false;
        return options;
    }

    /**
     * Gets the data object to be used by Handlebars when rending the HTML template
     * @param {Application.RenderOptions | undefined} options The data options
     */
    getData(options?: Application.RenderOptions): SimpleCalendarTemplate | Promise<SimpleCalendarTemplate> {
        return {
            calendar: this.activeCalendar.toTemplate(),
            calendarList: CalManager.getAllCalendars().map(c => {
                const cd = c.getCurrentDate();
                const ct = c.year.time.getCurrentTime();
                return {
                    id: c.id,
                    name: c.name,
                    date: FormatDateTime({year: cd.year, month: cd.month, day: cd.day, hour: 0, minute: 0, seconds: 0}, c.generalSettings.dateFormat.date, c),
                    time: c.generalSettings.showClock? FormatDateTime({year: 0, month: 1, day: 1, hour: ct.hour, minute: ct.minute, seconds: ct.seconds}, c.generalSettings.dateFormat.time, c) : '',
                    clockRunning: c.year.time.timeKeeper.getStatus() === TimeKeeperStatus.Started
                };
            }),
            clockClass: this.clockClass,
            isPrimary: SC.primary,
            theme: Themes.dark, //TODO: Update this when we have the theme being stored,
            uiElementStates: this.uiElementStates,
            search: this.search
        };
    }

    /**
     * Shows the application window
     */
    public showApp(){
        if(this.activeCalendar.canUser((<Game>game).user, this.activeCalendar.generalSettings.permissions.viewCalendar)){
            this.activeCalendar.year.setCurrentToVisible();
            this.uiElementStates.compactView = GameSettings.GetBooleanSettings(SettingNames.OpenCompact);

            const options:  Application.RenderOptions<Application.Options> = {}
            if(GameSettings.GetBooleanSettings(SettingNames.RememberPosition)){
                const pos = <AppPosition>GameSettings.GetObjectSettings(SettingNames.AppPosition);
                if(pos.top){
                    options.top = pos.top;
                }
                if(pos.left){
                    options.left = pos.left;
                }
            }
            this.render(true, options);
        }
    }

    /**
     * Closes the application window
     */
    public closeApp(){
        this.close().catch(error => Logger.error(error));
    }

    /**
     * Overwrite the minimization function to reduce the calendar down to the compact form
     * If the calendar is all ready in the compact form, restore to the full form
     */
    async minimize(){
        this.uiElementStates.compactView = !this.uiElementStates.compactView;
        this.activeCalendar.year.resetMonths('selected');
        this.toggleCalendarDrawer(true);
        this.toggleNoteDrawer(true);
        this.toggleSearchDrawer(true);
        this.setWidthHeight();
        this.render(true);
    }

    /**
     * Overwrite the maximize function to set the calendar to its full form
     */
    async maximize(){
        this.uiElementStates.compactView = false;
        this.toggleCalendarDrawer(true);
        this.toggleNoteDrawer(true);
        this.toggleSearchDrawer(true);
        this.setWidthHeight();
        this.render(true);
    }

    /**
     * Sets the width and height of the calendar window so that it is sized to show the calendar, the controls and space for 2 notes.
     */
    setWidthHeight(){
        let width = 0, height = 0;
        const main = <HTMLElement>document.querySelector('#simple-calendar-application');
        if(main){
            const header = <HTMLElement>main.querySelector('.window-header');
            if(header){
                height += header.offsetHeight;
            }
            const wrapper = <HTMLElement>main.querySelector('.sc-main-wrapper');
            if(wrapper){
                if(this.uiElementStates.compactView){
                    height += 24; //Height of top bar
                    height += 8; // Window Padding
                    width = 300;
                } else {
                    wrapper.querySelectorAll(".section").forEach((s, index) => {
                        height += (<HTMLElement>s).offsetHeight;
                    });
                    const currentDate = <HTMLElement>wrapper.querySelector('.calendar .calendar-header .current-date');
                    const week = <HTMLElement>wrapper.querySelector('.calendar .days .week');
                    const clock = <HTMLElement>wrapper.querySelector('.clock-display .sc-clock');
                    let currentDateWidth = 0, weekWidth = 0, clockWidth = 0;

                    if(currentDate){
                        Array.from(currentDate.children).forEach(c => {currentDateWidth += (<HTMLElement>c).offsetWidth;});
                        currentDateWidth += 20; //Margins on prev/next buttons
                    }
                    if(week){
                        weekWidth = week.offsetWidth;
                    }
                    if(clock){
                        Array.from(clock.children).forEach(c => {clockWidth += (<HTMLElement>c).offsetWidth;});
                        clockWidth += 8; //Clock Icon Margin
                    }
                    width = Math.max(currentDateWidth, weekWidth, clockWidth);
                    width += 10; //Calendar Padding
                    width += 70; //Action list width + Margin
                    width += 16; // Window Padding
                    height += 16; // Window Padding
                }
            }
            this.setPosition({width: width, height: height});
        }
    }

    /**
     * Keeps the current/selected date centered in the list of days for a month on calendars that have very long day lists
     * @param {JQuery} html
     */
    ensureCurrentDateIsVisible(html: JQuery){
        const calendar = (<JQuery>html).find(".calendar");
        const calendarHeight = calendar.outerHeight();

        //This only needs to be processed if the calendar is more than 499px tall
        if(calendarHeight && calendarHeight >= 500){
            const currentDay = calendar.find('.day.current');
            const selectedDay = calendar.find('.day.selected');

            //Prefer to use the selected day as the main day to focus on rather than the current day
            let elementToUse = null;
            if(selectedDay.length){
                elementToUse = selectedDay[0];
            } else if(currentDay.length){
                elementToUse = currentDay[0];
            }

            if(elementToUse !== null){
                const calendarRect = calendar[0].getBoundingClientRect();
                const rect = elementToUse.getBoundingClientRect();
                const insideViewPort = rect.top >= calendarRect.top && rect.left >= calendarRect.left && rect.bottom <= calendarRect.bottom && rect.right <= calendarRect.right;
                if(!insideViewPort){
                    Logger.debug(`The Current/Selected day is not in the viewport, updating the day list scroll top position.`);
                    calendar[0].scrollTop = rect.top - calendarRect.top - (calendarHeight/ 2);
                }
            }
        }
    }

    /**
     * Process the drag end of the application moving around
     * @param e
     */
    public appDragEnd(e: Event){
        //@ts-ignore
        this._onDragMouseUp(e);
        const app = document.getElementById('simple-calendar-application');
        if(app){
            const appPos: AppPosition = {};
            appPos.top = parseFloat(app.style.top);
            appPos.left = parseFloat(app.style.left);
            GameSettings.SaveObjectSetting(SettingNames.AppPosition, appPos, false).catch(Logger.error);
        }
    }

    /**
     * Adds any event listeners to the application DOM
     * @param {JQuery<HTMLElement>} html The root HTML of the application window
     * @protected
     */
    public activateListeners(html: JQuery<HTMLElement>) {
        Logger.debug('Simple-Calendar activateListeners()');
        if(html.hasOwnProperty("length")) {
            this.setWidthHeight();
            this.ensureCurrentDateIsVisible(html);

            const appWindow = document.getElementById('simple-calendar-application');
            if(appWindow){
                //Window Drag Listener
                const header = appWindow.querySelector('header');
                if(header){
                    const drag = new Draggable(this, jQuery(appWindow), header, this.options.resizable);
                    drag.handlers["dragMove"] = ["mousemove", e => {}, false];
                    drag.handlers["dragUp"] = ["mouseup", this.appDragEnd.bind(drag), false];
                }

                // Click anywhere in the app
                appWindow.addEventListener('click', () => {
                    this.toggleUnitSelector(true);
                });

                if(this.uiElementStates.compactView){
                    appWindow.classList.add('compact-view');
                } else {
                    appWindow.classList.remove('compact-view');
                    // Activate the full calendar display listeners
                    Renderer.CalendarFull.ActivateListeners(`sc_${this.activeCalendar.id}_calendar`, this.changeMonth.bind(this), this.dayClick.bind(this));
                }
                // Activate the clock listeners
                Renderer.Clock.ActivateListeners(`sc_${this.activeCalendar.id}_clock`);

                //-----------------------
                // Calendar Action List
                //-----------------------
                // Calendar List Click
                appWindow.querySelector(".sc-actions-list .calendar-list")?.addEventListener('click', this.toggleCalendarDrawer.bind(this, false));
                //Configuration Button Click
                appWindow.querySelector(".sc-actions-list .configure-button")?.addEventListener('click', this.configurationClick.bind(this));
                //Search button click
                appWindow.querySelector(".sc-actions-list .search")?.addEventListener('click', this.toggleSearchDrawer.bind(this, false));
                // Add new note click
                appWindow.querySelector(".sc-actions-list .add-note")?.addEventListener('click', this.addNote.bind(this));
                // Note Drawer Toggle
                appWindow.querySelector(".sc-actions-list .notes")?.addEventListener('click', this.toggleNoteDrawer.bind(this, false));
                appWindow.querySelector(".sc-actions-list .reminder-notes")?.addEventListener('click', this.toggleNoteDrawer.bind(this, false));
                // Today button click
                appWindow.querySelector('.sc-actions-list .today')?.addEventListener('click', this.todayClick.bind(this));
                // Set Current Date
                appWindow.querySelector('.sc-actions-list .btn-apply')?.addEventListener('click', this.dateControlApply.bind(this));
                // Real Time Clock
                appWindow.querySelector(".time-start")?.addEventListener('click', this.startTime.bind(this));
                appWindow.querySelector(".time-stop")?.addEventListener('click', this.stopTime.bind(this));

                //-----------------------
                // Calendar Drawer
                //-----------------------
                //Calendar Click
                appWindow.querySelectorAll('.sc-calendar-list .calendar-display').forEach(e => {
                    e.addEventListener('click', this.changeCalendar.bind(this));
                });
                //-----------------------
                // Note/Search Drawer
                //-----------------------
                // Note Click/Drag
                appWindow.querySelectorAll(".sc-note-list .note").forEach(n => {
                    n.addEventListener('click', this.viewNote.bind(this));
                    n.addEventListener('drag', this.noteDrag.bind(this));
                    n.addEventListener('dragend', this.noteDragEnd.bind(this));
                });
                appWindow.querySelectorAll(".sc-note-search .note-list .note").forEach(n => {
                    n.addEventListener('click', this.viewNote.bind(this));
                });
                //Search Click
                appWindow.querySelector(".sc-note-search .search-box .fa-search")?.addEventListener('click', this.searchClick.bind(this));
                //Search Clear Click
                appWindow.querySelector(".sc-note-search .search-box .fa-times")?.addEventListener('click', this.searchClearClick.bind(this));
                //Search Input Key Up
                appWindow.querySelector(".sc-note-search .search-box input")?.addEventListener('keyup', this.searchBoxChange.bind(this));
                //Search Options Header Click
                appWindow.querySelector(".sc-note-search .search-options-header")?.addEventListener('click', this.searchOptionsToggle.bind(this, false));
                //Search Options Fields Change
                appWindow.querySelectorAll(".sc-note-search .search-fields input").forEach(n => {
                    n.addEventListener('change', this.searchOptionsFieldsChange.bind(this));
                });

                //-----------------------
                // Date/Time Controls
                //-----------------------
                appWindow.querySelectorAll(".unit-controls .selector").forEach(s => {
                    s.addEventListener('click', this.toggleUnitSelector.bind(this, false));
                });
                appWindow.querySelectorAll(".unit-controls .unit-list li").forEach(c => {
                    c.addEventListener('click', this.changeUnit.bind(this));
                });
                appWindow.querySelectorAll(".controls .control").forEach(c => {
                    c.addEventListener('click', this.timeUnitClick.bind(this));
                });
            }
        }
    }

    /**
     * Opens and closes the note drawer
     * @param forceHide Force the drawer to hide
     */
    public toggleCalendarDrawer(forceHide: boolean = false){
        if(!forceHide){
            this.toggleSearchDrawer(true);
            this.toggleNoteDrawer(true);
        }
        const cList = document.querySelector(".sc-calendar-list");
        if(cList){
            this.uiElementStates.calendarDrawerOpen = animateElement(cList, 500, forceHide);
        }
    }

    /**
     * Opens and closes the note drawer
     * @param forceHide Force the drawer to hide
     */
    public toggleNoteDrawer(forceHide: boolean = false){
        if(!forceHide){
            this.toggleSearchDrawer(true);
            this.toggleCalendarDrawer(true);
        }
        const noteList = document.querySelector(".sc-note-list");
        if(noteList){
            this.uiElementStates.noteDrawerOpen = animateElement(noteList, 500, forceHide);
        }
    }

    /**
     * Opens and closes the search drawer
     * @param forceHide Force the drawer to hide
     */
    public toggleSearchDrawer(forceHide: boolean = false){
        if(!forceHide){
            this.toggleNoteDrawer(true);
            this.toggleCalendarDrawer(true);
        }
        this.searchOptionsToggle(true);
        const noteList = document.querySelector(".sc-note-search");
        if(noteList){
            this.uiElementStates.searchDrawerOpen = animateElement(noteList, 500, forceHide);
        }
    }

    /**
     * Opens and closes the date time unit selector dropdown
     * @param forceHide
     */
    public toggleUnitSelector(forceHide: boolean = false){
        let unitList = document.querySelector(`.sc-main-wrapper .unit-list`);
        if(unitList){
            this.uiElementStates.dateTimeUnitOpen = animateElement(unitList, 500, forceHide);
        }
    }

    /**
     * Processes changing the selected time unit for the date/time input
     * @param e
     */
    public changeUnit(e: Event){
        const target = <HTMLElement>e.currentTarget;
        const dataUnit = target.getAttribute('data-unit');
        if(dataUnit){
            let change = false;
            if(dataUnit === 'year'){
                this.uiElementStates.dateTimeUnit = DateTimeUnits.Year;
                this.uiElementStates.dateTimeUnitText = "FSC.Year";
                change = true;
            } else if(dataUnit === 'month'){
                this.uiElementStates.dateTimeUnit = DateTimeUnits.Month;
                this.uiElementStates.dateTimeUnitText = "FSC.Month";
                change = true;
            } else if(dataUnit === 'day'){
                this.uiElementStates.dateTimeUnit = DateTimeUnits.Day;
                this.uiElementStates.dateTimeUnitText = "FSC.Day";
                change = true;
            } else if(dataUnit === 'hour'){
                this.uiElementStates.dateTimeUnit = DateTimeUnits.Hour;
                this.uiElementStates.dateTimeUnitText = "FSC.Hour";
                change = true;
            } else if(dataUnit === 'minute'){
                this.uiElementStates.dateTimeUnit = DateTimeUnits.Minute;
                this.uiElementStates.dateTimeUnitText = "FSC.Minute";
                change = true;
            } else if(dataUnit === 'second'){
                this.uiElementStates.dateTimeUnit = DateTimeUnits.Second;
                this.uiElementStates.dateTimeUnitText = "FSC.Second";
                change = true;
            }
            if(change){
                this.updateApp();
            }
        }
    }

    public changeCalendar(e: Event){
        const target = <HTMLElement>e.currentTarget;
        if(target){
            const calendarId = target.getAttribute('data-calid');
            if(calendarId && this.activeCalendar.id !== calendarId){
                CalManager.setActiveCalendar(calendarId);
                this.render(true);
            }
        }
    }

    /**
     * Processes the callback from the Calendar Renderer's month change click
     * @param {CalendarClickEvents} clickType What was clicked, previous or next
     * @param {SCRenderer.CalendarOptions} options The renderer's options associated with the calendar
     */
    public changeMonth(clickType: CalendarClickEvents, options: SCRenderer.CalendarOptions){
        this.toggleUnitSelector(true);
        this.activeCalendar.year.changeMonth(clickType === CalendarClickEvents.previous? -1 : 1);
        this.setWidthHeight();
    }
    
    /**
     * Click event when a users clicks on a day
     * @param {SCRenderer.CalendarOptions} options The renderer options for the calendar who's day was clicked
     */
    public dayClick(options: SCRenderer.CalendarOptions){
        this.toggleUnitSelector(true);
        if(options.selectedDates && options.selectedDates.start.day && options.selectedDates.start.month >= 0 && options.selectedDates.start.month < this.activeCalendar.year.months.length){
            const selectedDay = options.selectedDates.start.day;
            let allReadySelected = false;
            const currentlySelectedMonth = this.activeCalendar.year.getMonth('selected');
            if(currentlySelectedMonth){
                const currentlySelectedDay = currentlySelectedMonth.getDay('selected');
                allReadySelected = currentlySelectedDay !== undefined && currentlySelectedDay.numericRepresentation === selectedDay && this.activeCalendar.year.selectedYear === options.selectedDates.start.year;
            }

            this.activeCalendar.year.resetMonths('selected');
            if(!allReadySelected){
                const month = this.activeCalendar.year.months[options.selectedDates.start.month];
                const dayIndex = month.days.findIndex(d => d.numericRepresentation === selectedDay);
                if(dayIndex > -1){
                    month.selected = true;
                    month.days[dayIndex].selected = true;
                    this.activeCalendar.year.selectedYear = this.activeCalendar.year.visibleYear;
                }
            }
            this.updateApp();
        }
    }

    /**
     * Click event when a user clicks on the Today button
     * @param {Event} e The click event
     */
    public todayClick(e: Event) {
        const selectedMonth = this.activeCalendar.year.getMonth('selected');
        if(selectedMonth){
            selectedMonth.selected = false;
            const selectedDay = selectedMonth.getDay('selected');
            if(selectedDay){
                selectedDay.selected = false;
            }
        }
        const visibleMonth = this.activeCalendar.year.getMonth('visible');
        if(visibleMonth){
            visibleMonth.visible = false;
        }
        const currentMonth = this.activeCalendar.year.getMonth();
        if(currentMonth){
            const currentDay = currentMonth.getDay();
            if(currentDay){
                this.activeCalendar.year.selectedYear = this.activeCalendar.year.numericRepresentation;
                this.activeCalendar.year.visibleYear = this.activeCalendar.year.numericRepresentation;
                currentMonth.visible = true;
                currentMonth.selected = true;
                currentDay.selected = true;
                this.updateApp();
            }
        }
    }

    /**
     * When the change time unit buttons are clicked
     * @param e
     */
    public timeUnitClick(e: Event){
        e.stopPropagation();
        const target = <HTMLElement>e.currentTarget;
        const dataType = target.getAttribute('data-type');
        const dataAmount = target.getAttribute('data-amount');
        if(dataType && dataAmount){
            const amount = parseInt(dataAmount);
            if(!GameSettings.IsGm() || !SC.primary){
                if(!(<Game>game).users?.find(u => u.isGM && u.active)){
                    GameSettings.UiNotification((<Game>game).i18n.localize('FSC.Warn.Calendar.NotGM'), 'warn');
                } else {
                    const socketData = <SimpleCalendarSocket.SimpleCalendarSocketDateTime>{dataType: 'time', isNext: true, amount: amount, unit: dataType};
                    Logger.debug(`Sending Date/Time Change to Primary GM`);
                    GameSockets.emit({type: SocketTypes.dateTime, data: socketData}).catch(Logger.error);
                }

            } else if(!isNaN(amount)){
                let change = false;
                if(dataType === 'second' || dataType === 'minute' || dataType === 'hour'){
                    this.activeCalendar.year.changeTime(true, dataType, amount);
                    change = true;
                } else if(dataType === 'year'){
                    this.activeCalendar.year.changeYear(amount, false, "current");
                    change = true;
                } else if(dataType === 'month'){
                    this.activeCalendar.year.changeMonth(amount, 'current');
                    change = true;
                } else if(dataType === 'day'){
                    this.activeCalendar.year.changeDay(amount, 'current');
                    change = true;
                }

                if(change){
                    CalManager.saveCalendars();
                    //Sync the current time on apply, this will propagate to other modules
                    this.activeCalendar.syncTime(true).catch(Logger.error);
                }
            }
        } else if(dataType && (dataType === 'dawn' || dataType === 'midday' || dataType === 'dusk' || dataType === 'midnight')){
            this.timeOfDayControlClick(dataType);
            CalManager.saveCalendars();
            //Sync the current time on apply, this will propagate to other modules
            this.activeCalendar.syncTime(true).catch(Logger.error);
        }
    }

    /**
     * Processes the clicking to advance the calendar to the next defined time of day
     * @param type
     */
    public timeOfDayControlClick(type: string){
        let month = this.activeCalendar.year.getMonth();
        let day: Day | undefined;
        switch (type){
            case 'dawn':
                if(month){
                    day = month.getDay();
                    if(day){
                        let sunriseTime = this.activeCalendar.year.getSunriseSunsetTime(this.activeCalendar.year.numericRepresentation, month, day, true, false);
                        if(this.activeCalendar.year.time.seconds >= sunriseTime){
                            this.activeCalendar.year.changeDay(1, 'current');
                            month = this.activeCalendar.year.getMonth();
                            if(month){
                                day = month.getDay();
                                if(day){
                                    sunriseTime = this.activeCalendar.year.getSunriseSunsetTime(this.activeCalendar.year.numericRepresentation, month, day, true, false);
                                    this.activeCalendar.year.time.seconds = sunriseTime;
                                }
                            }
                        } else {
                            this.activeCalendar.year.time.seconds = sunriseTime;
                        }
                    }
                }
                break;
            case 'midday':
                const halfDay = this.activeCalendar.year.time.secondsPerDay / 2;
                if(this.activeCalendar.year.time.seconds >= halfDay){
                    this.activeCalendar.year.changeDay(1, 'current');
                }
                this.activeCalendar.year.time.seconds = halfDay;
                break;
            case 'dusk':
                if(month){
                    day = month.getDay();
                    if(day){
                        let sunsetTime = this.activeCalendar.year.getSunriseSunsetTime(this.activeCalendar.year.numericRepresentation, month, day, false, false);
                        if(this.activeCalendar.year.time.seconds >= sunsetTime){
                            this.activeCalendar.year.changeDay(1, 'current');
                            month = this.activeCalendar.year.getMonth();
                            if(month){
                                day = month.getDay();
                                if(day){
                                    sunsetTime = this.activeCalendar.year.getSunriseSunsetTime(this.activeCalendar.year.numericRepresentation, month, day, false, false);
                                    this.activeCalendar.year.time.seconds = sunsetTime;
                                }
                            }
                        } else {
                            this.activeCalendar.year.time.seconds = sunsetTime;
                        }
                    }
                }
                break;
            case 'midnight':
                this.activeCalendar.year.changeTime(true, 'second', this.activeCalendar.year.time.secondsPerDay - this.activeCalendar.year.time.seconds);
                break;
        }
    }

    /**
     * Click event for when a gm user clicks on the apply button for the current date controls
     * Will attempt to save the new current date to the world settings.
     * @param {Event} e The click event
     */
    public dateControlApply(e: Event){
        if(this.activeCalendar.canUser((<Game>game).user, this.activeCalendar.generalSettings.permissions.changeDateTime)){
            let validSelection = false;
            const selectedYear = this.activeCalendar.year.selectedYear;
            const selectedMonth = this.activeCalendar.year.getMonth('selected');
            if(selectedMonth){
                const selectedDay = selectedMonth.getDay('selected');
                if(selectedDay){
                    Logger.debug(`Updating current date to selected day.`);
                    validSelection = true;
                    if(selectedYear !== this.activeCalendar.year.visibleYear || !selectedMonth.visible){
                        const utsd = new Dialog({
                            title: GameSettings.Localize('FSC.SetCurrentDateDialog.Title'),
                            content: GameSettings.Localize('FSC.SetCurrentDateDialog.Content').replace('{DATE}', `${selectedMonth.name} ${selectedDay.numericRepresentation}, ${selectedYear}`),
                            buttons:{
                                yes: {
                                    label: GameSettings.Localize('Yes'),
                                    callback: this.setCurrentDate.bind(this, selectedYear, selectedMonth, selectedDay)
                                },
                                no: {
                                    label: GameSettings.Localize('No')
                                }
                            },
                            default: "no"
                        });
                        utsd.render(true);
                    } else {
                        this.setCurrentDate(selectedYear, selectedMonth, selectedDay);
                    }
                }
            }
            if(!validSelection){
                CalManager.saveCalendars();
                //Sync the current time on apply, this will propagate to other modules
                this.activeCalendar.syncTime().catch(Logger.error);
            }
        } else {
            GameSettings.UiNotification(GameSettings.Localize("FSC.Error.Calendar.GMCurrent"), 'warn');
        }
    }

    /**
     * Sets the current date for the calendar
     * @param {number} year The year number to set the date to
     * @param {Month} month The month object to set as current
     * @param {Day} day They day object to set as current
     */
    public setCurrentDate(year: number, month: Month, day: Day){
        if(!GameSettings.IsGm() || !SC.primary){
            if(!(<Game>game).users?.find(u => u.isGM && u.active)){
                GameSettings.UiNotification((<Game>game).i18n.localize('FSC.Warn.Calendar.NotGM'), 'warn');
            } else {
                const socketData = <SimpleCalendarSocket.SimpleCalendarSocketDate>{year: year, month: month.numericRepresentation, day: day.numericRepresentation};
                Logger.debug(`Sending Date Change to Primary GM: ${socketData.year}, ${socketData.month}, ${socketData.day}`);
                GameSockets.emit({type: SocketTypes.date, data: socketData}).catch(Logger.error);
            }
        } else {
            this.activeCalendar.year.numericRepresentation = year;
            this.activeCalendar.year.resetMonths();
            month.current = true;
            month.selected = false;
            day.current = true;
            day.selected = false;
            CalManager.saveCalendars();
            //Sync the current time on apply, this will propagate to other modules
            this.activeCalendar.syncTime().catch(Logger.error);
        }
    }

    /**
     * When the search button next to the search box is clicked, or the enter key is used on the search input
     */
    public searchClick() {
        const searchInput = <HTMLInputElement>document.getElementById('simpleCalendarSearchBox');
        if(searchInput){
            this.search.term = searchInput.value;
            this.search.results = [];
            if(this.search.term){

                this.search.results = this.activeCalendar.searchNotes(this.search.term, this.search.options.fields);
            }
            this.updateApp();
        }
    }

    /**
     * Clears the search terms and results.
     */
    public searchClearClick(){
        this.search.term = '';
        this.search.results = [];
        this.updateApp();
    }

    /**
     * Processes text input into the search box.
     * @param e
     */
    public searchBoxChange(e: Event){
        if((<KeyboardEvent>e).key === "Enter"){
            this.searchClick();
        } else {
            this.search.term = (<HTMLInputElement>e.target).value;
        }
    }

    /**
     * Opens and closes the search options area
     * @param forceClose
     */
    public searchOptionsToggle(forceClose: boolean = false){
        let so = document.querySelector(`.sc-note-search .search-options`);
        if(so){
            this.uiElementStates.searchOptionsOpen = animateElement(so, 500, forceClose);
        }
    }

    /**
     * Processes the checking/unchecking of search options fields inputs
     * @param e
     */
    public searchOptionsFieldsChange(e: Event){
        const element = <HTMLInputElement>e.target;
        if(element){
            const field = element.getAttribute('data-field');
            if(field && this.search.options.fields.hasOwnProperty(field)){
                this.search.options.fields[field as keyof SearchOptions.Fields] = element.checked;
            }
        }
    }

    /**
     * Click event for when a gm user clicks on the configuration button to configure the game calendar
     * @param {Event} e The click event
     */
    public configurationClick(e: Event) {
        if(GameSettings.IsGm()){
            if(!ConfigurationApp.instance || (ConfigurationApp.instance && !ConfigurationApp.instance.rendered)){
                ConfigurationApp.instance = new ConfigurationApp();
                ConfigurationApp.instance.showApp();
            } else {
                ConfigurationApp.instance.bringToTop();
            }
        } else {
            GameSettings.UiNotification(GameSettings.Localize("FSC.Error.Calendar.GMConfigure"), 'warn');
        }
    }

    /**
     * Opens up the note adding dialog
     * @param {Event} e The click event
     */
    public addNote(e: Event) {
        e.stopPropagation();
        if(!(<Game>game).users?.find(u => u.isGM && u.active)){
            GameSettings.UiNotification((<Game>game).i18n.localize('FSC.Warn.Notes.NotGM'), 'warn');
        } else {
            SC.openNewNoteApp();
        }
    }

    /**
     * Opens up a note to view the contents
     * @param {Event} e The click event
     */
    public viewNote(e: Event){
        e.stopPropagation();
        const dataIndex = (<HTMLElement>e.currentTarget).getAttribute('data-index');
        if(dataIndex){
            const note = this.activeCalendar.notes.find(n=> n.id === dataIndex);
            if(note){
                NotesApp.instance = new NotesApp(note, true);
                NotesApp.instance.showApp();
            }
        } else {
            Logger.error('No Data index on note element found.');
        }
    }

    /**
     * Re renders the application window
     * @private
     */
    public updateApp(){
        if(this.rendered){
            this.render(false, {});
        }
    }

    //---------------------------
    // Time Keeper
    //---------------------------

    /**
     * Starts the built in time keeper
     */
    startTime(){
        const scenes = (<Game>game).scenes;
        const combats = (<Game>game).combats;
        const activeScene = scenes? scenes.active? scenes.active.id : null : null;
        if(combats && combats.size > 0 && combats.find(g => g.started && ((activeScene !== null && g.scene && g.scene.id === activeScene) || activeScene === null))){
            GameSettings.UiNotification((<Game>game).i18n.localize('FSC.Warn.Time.ActiveCombats'), 'warn');
        } else if(this.activeCalendar.generalSettings.gameWorldTimeIntegration === GameWorldTimeIntegrations.None || this.activeCalendar.generalSettings.gameWorldTimeIntegration === GameWorldTimeIntegrations.Self || this.activeCalendar.generalSettings.gameWorldTimeIntegration === GameWorldTimeIntegrations.Mixed){
            this.activeCalendar.year.time.timeKeeper.start();
            this.clockClass = this.activeCalendar.year.time.timeKeeper.getStatus();
            this.updateApp();
        }
    }

    /**
     * Stops the built in time keeper
     */
    stopTime(){
        this.activeCalendar.year.time.timeKeeper.stop();
        this.clockClass = this.activeCalendar.year.time.timeKeeper.getStatus();
        this.updateApp();
    }

    /**
     * Checks to see if the module import/export dialog needs to be shown and syncs the game world time with the simple calendar
     */
    async timeKeepingCheck(){
        //If the current year is set up and the calendar is set up for time keeping and the user is the GM
        if(this.activeCalendar.generalSettings.gameWorldTimeIntegration !== GameWorldTimeIntegrations.None && GameSettings.IsGm() ){
            //Sync the current world time with the simple calendar
            await this.activeCalendar.syncTime();
        }
    }

    /**
     * While a note is being dragged
     * @param {Event} event
     */
    noteDrag(event: Event){
        const selectedItem = <HTMLElement>event.target,
            list = selectedItem.parentNode,
            x = (<DragEvent>event).clientX,
            y = (<DragEvent>event).clientY;
        selectedItem.classList.add('drag-active');
        let swapItem: Element | ChildNode | null = document.elementFromPoint(x, y) === null ? selectedItem : document.elementFromPoint(x, y);
        if (list !== null && swapItem !== null && list === swapItem.parentNode) {
            swapItem = swapItem !== selectedItem.nextSibling ? swapItem : swapItem.nextSibling;
            list.insertBefore(selectedItem, swapItem);
        }
    }

    /**
     * When the dragging has ended, re-order all events on this day and save their new order
     * @param {Event} event
     */
    noteDragEnd(event: Event){
        const selectedItem = <HTMLElement>event.target,
            list = selectedItem.parentNode,
            id = selectedItem.getAttribute('data-index');
        selectedItem.classList.remove('drag-active');
        if(id && list){
            const noteIDOrder: string[] = [];
            for(let i = 0; i < list.children.length; i++){
                const cid = list.children[i].getAttribute('data-index');
                if(cid){
                    noteIDOrder.push(cid);
                }
            }
            this.activeCalendar.reorderNotesOnDay(noteIDOrder);
        }
    }

}
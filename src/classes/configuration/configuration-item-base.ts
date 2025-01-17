import {generateUniqueId} from "../utilities/string";
import Calendar from "../calendar";

export default class ConfigurationItemBase{

    /**
     * A unique ID for this configuration item
     */
    id: string;
    /**
     * The numeric representation of this weekday
     */
    numericRepresentation: number;
    /**
     * The name of the weekday
     */
    name: string;

    constructor(name: string = '', numericRepresentation: number = NaN) {
        this.id = generateUniqueId();
        this.name = name;
        this.numericRepresentation = numericRepresentation;
    }

    /**
     * Creates a clone of the current configuration item base
     */
    clone() {
        const cib = new ConfigurationItemBase(this.name, this.numericRepresentation);
        cib.id = this.id;
        return cib;

    }

    /**
     * Creates a configuration object for the item base
     */
    toConfig(): SimpleCalendar.IDataItemBase{
        return {
            id: this.id,
            name: this.name,
            numericRepresentation: this.numericRepresentation
        }
    }

    /**
     * Creates a template for the configuration item base
     * @param calendar
     */
    toTemplate(calendar: Calendar | null = null): SimpleCalendar.IDataItemBase {
        return {
            id: this.id,
            name: this.name,
            numericRepresentation: this.numericRepresentation
        };
    }

    /**
     * Sets the properties for this class to options set in the passed in configuration object
     * @param config The configuration object for this class
     */
    loadFromSettings(config: SimpleCalendar.IDataItemBase): void{
        this.id = config.id;
        if(config.hasOwnProperty('name') && config.name){
            this.name = config.name;
        }
        if(config.hasOwnProperty('numericRepresentation') && config.numericRepresentation){
            this.numericRepresentation = config.numericRepresentation;
        }
    }
}

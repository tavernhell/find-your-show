import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { HttpService } from './services/http-service.service';
import { Observable, ReplaySubject, Subject, combineLatest, debounceTime, firstValueFrom, map, of, startWith, takeUntil } from 'rxjs';
import { DiscoverTvResponse, SearchInput, SelectOption, SelectOptionString, ShowDetails } from './interfaces/interfaces';
import { MatSelectChange } from '@angular/material/select';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {

  currentYear: number = new Date().getFullYear();
  minYear: number = 1910;
  
  formTV!: FormGroup;

  // list taken from: https://developers.themoviedb.org/3/discover/tv-discover
  statuses: SelectOption[] = [
    {
      id: 0,
      name: 'Returning Series'
    },
    {
      id: 1,
      name: 'Planned'
    },
    {
      id: 2,
      name: 'In Production'
    },
    {
      id: 3,
      name: 'Ended'
    },
    {
      id: 4,
      name: 'Cancelled'
    },
    {
      id: 5,
      name: 'Pilot'
    },
  ]

  andOr: SelectOptionString[] = [
    {
      id: ',',
      name: 'And'
    },
    {
      id: '|',
      name: 'Or'
    }
  ]


  /// ngx-mat-search
  placeholderLabel: string = 'Search';
  noEntriesFoundLabel: string = 'No results found';

  tvGenresSearch: FormControl = new FormControl('');
  filteredTVGenres$!: Observable<SelectOption[]>;

  tvGenresExcludedSearch: FormControl = new FormControl('');
  filteredTVGenresExcluded$!: Observable<SelectOption[]>;

  keywordsSearch: FormControl = new FormControl('');
  keywords$!: Observable<SelectOption[]>;
  keywords: string[] = [];

  constructor(private fb: FormBuilder, private httpService: HttpService) { }

  async ngOnInit(): Promise<void> {
    // Retrieve form data
    const formValue = JSON.parse(localStorage.getItem('formValue')!);
    
    //#region form initialisation
    this.formTV = this.fb.group({
      andorgenres: [formValue && formValue.andorgenres || ','],
      andorkeywords: [formValue && formValue.andorkeywords || ','],
      seasonNumMin: [formValue && formValue.seasonNumMin || 0],
      seasonNumMax: [formValue && formValue.seasonNumMax || null],
      episodeNumMin: [formValue && formValue.episodeNumMin || 0],
      episodeNumMax: [formValue && formValue.episodeNumMax || null],
      ratingMin: [formValue && formValue.ratingMin || 0],
      ratingMax: [formValue && formValue.ratingMax || 100],
      yearMin: [formValue && formValue.yearMin || this.minYear],
      yearMax: [formValue && formValue.yearMax || this.currentYear],
      genres: [formValue && formValue.genres || []],
      excludedGenres: [formValue && formValue.excludedGenres || []],
      keywords: [formValue && this.getKeywordsDescriptions(formValue.keywords) || []],
      status: [formValue && formValue.status || 3],
    });

    console.log('this.formTV', this.formTV.controls)

    this.formTV.valueChanges.subscribe(value => {
      // console.log('Change in form detected', value)
      this.saveFormState();
    });
    //#endregion form initialisation

    //#region keywords
    // Listen to keywordSearch changes
    this.keywordsSearch.valueChanges
      .pipe(debounceTime(500)) //wait 500 ms before subscribing
      .subscribe(async query => {
        if (query.length > 2) {
          this.keywords$ = this.httpService.getKeywords(query);
        } else {
          this.keywords$ = of([]); //empty search
        }
      }); 
    //#endregion

    //#region genres
    //Obs that emits an array representing TV genres
    const tvGenres$: Observable<SelectOption[]> = this.httpService.getTVGenres(); 

    //Obs that emit a string representing a search term, initially set to '' to target every genre
    const tvGenresValChanges$: Observable<string> = this.tvGenresSearch.valueChanges.pipe(startWith(''));  
    const tvGenresExcludedValChanges$: Observable<string> = this.tvGenresExcludedSearch.valueChanges.pipe(startWith(''));

    // whenever either tvGenres$ or tvGenresValChanges$ emits a new value (valueChanges since the HTTP call only happens once), combineLatest will emit a new value that includes both the most recent value from tvGenres$ (an array) and the most recent value from tvGenresValChanges$ (a string)
    this.filteredTVGenres$ = combineLatest([tvGenres$, tvGenresValChanges$]).pipe(
      // transform the item emitted by the observable, the result of this transformation will the output of the overall observable sequence
      map(([genres, searchTerm]) =>
        // filter the genres array based on whether each genre's name contains the search term (ignoring case)
        genres.filter((g) => g.name.toLocaleLowerCase().includes(searchTerm))
      )
    );

    this.filteredTVGenresExcluded$ = combineLatest([tvGenres$, tvGenresExcludedValChanges$]).pipe(
      map(([excludedGenres, searchTerm]) =>
        excludedGenres.filter((g) => g.name.toLocaleLowerCase().includes(searchTerm))
      )
    );
    //#endregion
  }

  /**
   * Extract the description of the keyword from the object
   * @param  {SelectOption[]} rawKeywords
   * @returns void
   */
  getKeywordsDescriptions(rawKeywords: SelectOption[]): void { 
    this.keywords = JSON.parse(JSON.stringify(rawKeywords?.map((keyword: SelectOption) => keyword.name).sort()));
  }

  /**
   * Update the keywords selection
   * @param  {MatSelectChange} ev
   * @returns void
   */
  handleKeywordsSelectionChange(ev: MatSelectChange): void {
    this.getKeywordsDescriptions(ev.value as SelectOption[]);
    this.saveFormState();
    // console.log('keywords:', this.keywords)
  }

  /**
   * Reset the keywords array and form control, update localStorage
   * @returns void
   */
  resetKeywords(): void {
    this.keywords = [];
    // Since patchValue/setValue doesn't work, re-create control from scratch
    this.formTV.removeControl('keywords');
    this.formTV.addControl('keywords', new FormControl([]));
    this.saveFormState();
  }

  /**
   * Reset the whole form
   * @returns void
   */
  resetForm(): void {

    this.formTV = this.fb.group({
      andorgenres: [','],
      andorkeywords: [','],
      seasonNumMin: [0],
      seasonNumMax: [null],
      episodeNumMin: [0],
      episodeNumMax: [null],
      ratingMin: [0],
      ratingMax: [100],
      yearMin: [this.minYear],
      yearMax: [this.currentYear],
      genres: [[]],
      excludedGenres: [[]],
      // keywords: [[]], //dealth with by the resetKeywords(), that will also update localStorage
      status: [3],
    });

    this.resetKeywords();
  }

  saveFormState(): void {
    localStorage.setItem('formValue', JSON.stringify(this.formTV.value));
  }

  async search(): Promise<void> {
    const searchParams: SearchInput = {
      andorgenres: this.formTV.get('andorgenres')!.value,
      andorkeywords: this.formTV.get('andorkeywords')!.value,
      seasonNumMin: this.formTV.get('seasonNumMin')!.value,
      seasonNumMax: this.formTV.get('seasonNumMax')!.value,
      episodeNumMin: this.formTV.get('episodeNumMin')!.value,
      episodeNumMax: this.formTV.get('episodeNumMax')!.value,
      ratingMin: this.formTV.get('ratingMin')!.value,
      ratingMax: this.formTV.get('ratingMax')!.value,
      yearMin: this.formTV.get('yearMin')!.value,
      yearMax: this.formTV.get('yearMax')!.value,
      genres:  this.formTV.get('genres')!.value,   
      excludedGenres:  this.formTV.get('excludedGenres')!.value,   
      // map object SelectOption to id
      keywords:  this.formTV.get('keywords')!.value?.map((keyword: SelectOption) => keyword.id),   
      status: this.formTV.get('status')!.value,    
    }

    const tvShows: DiscoverTvResponse = await firstValueFrom(this.httpService.searchTvShows(searchParams))
    const tvIds: number[] = tvShows.results.map(show => show.id);

    let showsDetailsList: ShowDetails[] = [];

    for await (let id of tvIds) {
      const showsDetails: ShowDetails = await firstValueFrom(this.httpService.getShowDetails(id));

      const minEpsBool: boolean = showsDetails.number_of_episodes > searchParams.episodeNumMin;
      const maxEpsDefined: boolean = searchParams.episodeNumMax !== null;
      const maxEpsBool: boolean = maxEpsDefined && showsDetails.number_of_episodes < searchParams.episodeNumMax!;

      const satisfiesEpsFilters: boolean = (minEpsBool && !maxEpsDefined) || (minEpsBool && maxEpsBool);

      const minSeasonBool: boolean = showsDetails.number_of_seasons > searchParams.seasonNumMin;
      const maxSeasonDefined: boolean = searchParams.seasonNumMax !== null;
      const maxSeasonBool: boolean = maxSeasonDefined && showsDetails.number_of_seasons < searchParams.seasonNumMax!;

      const satisfiesSeasonFilters: boolean = (minSeasonBool && !maxSeasonDefined) || (minSeasonBool && maxSeasonBool)

      if (satisfiesEpsFilters && satisfiesSeasonFilters) {
        showsDetailsList.push(showsDetails);
      }
    }

    console.log('searchParams', searchParams, 'tvIds', tvIds)
  }

  getKeywordsList() {
    if (this.keywords.length === 0) {
      return 'No keywords selected';
    }
    return this.keywords.join(',');
  }
}

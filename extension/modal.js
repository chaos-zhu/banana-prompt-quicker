class BananaModal {
    constructor(adapter) {
        this.adapter = adapter
        this.modal = null
        this.activeFilters = new Set()
        this.prompts = []
        this.customPrompts = []
        this.categories = new Set(['全部'])
        this.selectedCategory = 'all'
        this.sortMode = 'recommend' // 'recommend' | 'random'
        this.loadPrompts()
        this.loadSortMode()
        this.currentPage = 1
        this.pageSize = this.isMobile() ? 8 : 12
        this.filteredPrompts = []
        this.favorites = []
        this.keyboardHandler = this.handleKeyboard.bind(this)
        this._isInitialized = false // 用于区分首次显示和重新显示
        this.randomMap = new Map()
    }

    async loadPrompts() {
        let staticPrompts = []
        if (window.PromptManager) {
            staticPrompts = await window.PromptManager.get()
        }
        this.customPrompts = await this.getCustomPrompts()
        this.prompts = [...this.customPrompts, ...staticPrompts]

        // Aggregate categories
        this.categories = new Set(['全部'])
        this.prompts.forEach(p => {
            if (p.category) {
                this.categories.add(p.category)
            }
        })

        this.ensureRandomValues()

        this.updateCategoryDropdown()
        // 只在首次加载或有必要时重置页码
        this.applyFilters(!this._isInitialized)
    }

    ensureRandomValues() {
        this.prompts.forEach(p => {
            const key = `${p.title}-${p.author}`
            if (!this.randomMap.has(key)) {
                this.randomMap.set(key, Math.random())
            }
            p._randomVal = this.randomMap.get(key)
        })
    }

    updateCategoryDropdown() {
        const optionsContainer = document.getElementById('category-options-container')
        const triggerText = document.getElementById('category-trigger-text')
        if (!optionsContainer || !triggerText) return

        this.populateCategoryDropdown(optionsContainer, triggerText)
    }

    populateCategoryDropdown(optionsContainer, triggerText) {
        console.log('Populating categories:', this.categories)
        // Clear existing options
        optionsContainer.innerHTML = ''

        // Populate categories
        const sortedCategories = Array.from(this.categories).sort((a, b) => {
            if (a === '全部') return -1
            if (b === '全部') return 1
            return a.localeCompare(b)
        })

        if (sortedCategories.length === 0) {
            const empty = document.createElement('div')
            empty.textContent = '无分类'
            empty.style.cssText = `padding: 10px 16px; font-size: 14px; color: ${this.adapter.getThemeColors().textSecondary};`
            optionsContainer.appendChild(empty)
        }

        sortedCategories.forEach(cat => {
            const option = document.createElement('div')
            option.textContent = cat
            const currentLabel = this.selectedCategory === 'all' ? '全部' : this.selectedCategory
            const isSelected = cat === currentLabel
            const colors = this.adapter.getThemeColors()

            const baseStyle = `padding: 10px 16px; cursor: pointer; transition: all 0.2s; font-size: 14px;`
            const selectedStyle = isSelected
                ? `background: ${colors.primary}15; color: ${colors.primary}; font-weight: 600;`
                : `background: transparent; color: ${colors.text};`
            option.style.cssText = baseStyle + selectedStyle

            option.onmouseenter = () => {
                if (!isSelected) {
                    option.style.background = colors.surfaceHover
                }
                option.style.boxShadow = `0 2px 8px ${colors.shadow}`
            }
            option.onmouseleave = () => {
                if (!isSelected) {
                    option.style.background = 'transparent'
                } else {
                    option.style.background = `${colors.primary}15`
                }
                option.style.boxShadow = 'none'
            }

            option.onclick = (e) => {
                e.stopPropagation()
                this.selectedCategory = cat === '全部' ? 'all' : cat
                triggerText.textContent = cat

                // Hide dropdown
                optionsContainer.style.display = 'none'
                optionsContainer.setAttribute('data-visible', 'false')

                this.populateCategoryDropdown(optionsContainer, triggerText)

                this.applyFilters(true)
            }

            optionsContainer.appendChild(option)
        })

        // Reset trigger text if needed
        const currentLabel = this.selectedCategory === 'all' ? '全部' : this.selectedCategory
        triggerText.textContent = currentLabel
    }

    async loadSortMode() {
        const result = await chrome.storage.local.get(['banana-sort-mode'])
        this.sortMode = result['banana-sort-mode'] || 'recommend'
    }

    async setSortMode(mode) {
        this.sortMode = mode
        await chrome.storage.local.set({ 'banana-sort-mode': mode })
    }

    async getCustomPrompts() {
        const result = await chrome.storage.local.get(['banana-custom-prompts'])
        return result['banana-custom-prompts'] || []
    }

    async compressImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = (event) => {
                const img = new Image()
                img.src = event.target.result
                img.onload = () => {
                    const canvas = document.createElement('canvas')
                    const MAX_WIDTH = 300
                    const MAX_HEIGHT = 300
                    let width = img.width
                    let height = img.height

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width
                            width = MAX_WIDTH
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height
                            height = MAX_HEIGHT
                        }
                    }

                    canvas.width = width
                    canvas.height = height
                    const ctx = canvas.getContext('2d')
                    ctx.drawImage(img, 0, 0, width, height)

                    // 压缩为 JPEG, 质量 0.7
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
                    resolve(dataUrl)
                }
                img.onerror = reject
            }
            reader.onerror = reject
        })
    }

    show() {
        if (!this.modal) {
            this.modal = this.createModal()
            document.body.appendChild(this.modal)
        }
        this.modal.style.display = 'flex'

        if (!this._isInitialized) {
            // 首次显示：完整初始化
            this.updateCategoryDropdown()
            this.applyFilters(true)
            this._isInitialized = true
        } else {
            // 重新显示：只刷新数据，保留状态
            this.loadPrompts().then(() => {
                // 刷新当前页面显示（保持在当前页）
                this.renderCurrentPage()
            })
        }

        // 添加键盘事件监听器
        document.addEventListener('keydown', this.keyboardHandler)
    }

    hide() {
        if (this.modal) {
            this.modal.style.display = 'none'
        }
        // 移除键盘事件监听器
        document.removeEventListener('keydown', this.keyboardHandler)
    }

    isMobile() {
        return window.innerWidth <= 768
    }

    createModal() {
        const colors = this.adapter.getThemeColors()
        const mobile = this.isMobile()

        const modalElement = document.createElement('div')
        modalElement.id = 'prompts-modal'
        modalElement.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 1000;'

        const container = document.createElement('div')
        // Removed overflow: hidden to allow dropdown to show
        container.style.cssText = `background: ${colors.background}; border-radius: ${mobile ? '24px 24px 0 0' : '20px'}; box-shadow: 0 20px 60px ${colors.shadow}; max-width: ${mobile ? '100%' : '900px'}; width: ${mobile ? '100%' : '90%'}; max-height: ${mobile ? '90vh' : '85vh'}; display: flex; flex-direction: column; ${mobile ? 'margin-top: auto;' : ''}; overflow: visible;`
        // Remove stopPropagation to allow clicks to bubble to document for dropdown closing
        // container.onclick = (e) => e.stopPropagation()

        const searchSection = this.createSearchSection(colors, mobile)
        const content = this.createContent(colors, mobile)

        container.appendChild(searchSection)
        container.appendChild(content)
        modalElement.appendChild(container)

        modalElement.addEventListener('click', (e) => {
            if (e.target === modalElement) {
                this.hide()
            }
        })

        if (mobile) {
            modalElement.addEventListener('touchstart', (e) => {
                if (e.target === modalElement) {
                    this.hide()
                }
            })
        }

        return modalElement
    }

    createSearchSection(colors, mobile) {
        const searchSection = document.createElement('div')
        // Ensure overflow is visible so dropdown can show
        searchSection.style.cssText = `padding: ${mobile ? '16px' : '20px 24px'}; border-bottom: 1px solid ${colors.border}; display: flex; ${mobile ? 'flex-direction: column; gap: 12px;' : 'align-items: center; gap: 16px;'}; overflow: visible; z-index: 100; position: relative;`

        // 搜索框容器
        const searchContainer = document.createElement('div')
        searchContainer.style.cssText = `${mobile ? 'width: 100%;' : 'flex: 1;'} display: flex; align-items: center; gap: 8px; position: relative;`

        const searchInput = document.createElement('input')
        searchInput.type = 'text'
        searchInput.id = 'prompt-search'
        searchInput.placeholder = '搜索...'
        searchInput.style.cssText = `flex: 1; padding: ${mobile ? '14px 20px' : '12px 18px'}; border: 1px solid ${colors.inputBorder}; border-radius: 16px; outline: none; font-size: ${mobile ? '16px' : '14px'}; background: ${colors.inputBg}; color: ${colors.text}; box-sizing: border-box; transition: all 0.2s;`
        searchInput.addEventListener('input', () => this.applyFilters(true))

        searchInput.addEventListener('focus', () => {
            searchInput.style.borderColor = colors.primary
        })
        searchInput.addEventListener('blur', () => {
            const currentColors = this.adapter.getThemeColors()
            searchInput.style.borderColor = currentColors.inputBorder
        })

        // Sort Mode Button
        const sortBtnContainer = document.createElement('div')
        sortBtnContainer.style.cssText = 'position: relative; display: flex; align-items: center;'

        const sortBtn = document.createElement('button')
        sortBtn.id = 'sort-mode-btn'
        const currentModeText = this.sortMode === 'recommend' ? '随机焕新' : '推荐排序'
        sortBtn.innerHTML = this.sortMode === 'recommend'
            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>'
            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>'
        sortBtn.style.cssText = `padding: ${mobile ? '10px' : '8px'}; border: none; background: transparent; color: ${colors.textSecondary}; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; border-radius: 8px;`
        sortBtn.onclick = () => this.toggleSortMode()

        // Tooltip
        const tooltip = document.createElement('div')
        tooltip.id = 'sort-tooltip'
        tooltip.textContent = `切换${currentModeText}`
        tooltip.style.cssText = `position: absolute; bottom: -40px; left: 50%; transform: translateX(-50%); background: ${colors.surface}; color: ${colors.text}; padding: 6px 12px; border-radius: 8px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; box-shadow: 0 4px 12px ${colors.shadow}; border: 1px solid ${colors.border}; z-index: 1000;`

        if (!mobile) {
            sortBtn.onmouseenter = () => {
                sortBtn.style.color = colors.primary
                sortBtn.style.transform = 'scale(1.1)'
                sortBtn.style.background = `${colors.primary}10`
                tooltip.style.opacity = '1'
            }
            sortBtn.onmouseleave = () => {
                sortBtn.style.color = colors.textSecondary
                sortBtn.style.transform = 'scale(1)'
                sortBtn.style.background = 'transparent'
                tooltip.style.opacity = '0'
            }
        }

        sortBtnContainer.appendChild(sortBtn)
        sortBtnContainer.appendChild(tooltip)

        searchContainer.appendChild(searchInput)
        searchContainer.appendChild(sortBtnContainer)

        const filterContainer = document.createElement('div')
        filterContainer.style.cssText = `display: flex; gap: 8px; align-items: center; ${mobile ? 'justify-content: space-between; flex-wrap: wrap;' : ''}; position: relative; z-index: 101;`

        // Category Dropdown
        // Custom Category Dropdown
        const dropdownContainer = document.createElement('div')
        dropdownContainer.style.cssText = `position: relative; z-index: 1000;`

        const dropdownTrigger = document.createElement('div')
        dropdownTrigger.id = 'category-dropdown-trigger'
        dropdownTrigger.style.cssText = `padding: ${mobile ? '10px 14px' : '8px 12px'}; border: 1px solid ${colors.border}; border-radius: 16px; background: ${colors.surface}; color: ${colors.text}; font-size: ${mobile ? '14px' : '13px'}; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s; width: 60px; justify-content: space-between; user-select: none;`

        const triggerText = document.createElement('span')
        triggerText.id = 'category-trigger-text'
        triggerText.textContent = this.selectedCategory === 'all' ? '全部' : this.selectedCategory
        triggerText.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: center;'

        const arrowIcon = document.createElement('span')
        arrowIcon.innerHTML = `<svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1L5 5L9 1"/></svg>`
        arrowIcon.style.cssText = `display: flex; align-items: center; transition: transform 0.2s; opacity: 0.6;`

        dropdownTrigger.appendChild(triggerText)
        dropdownTrigger.appendChild(arrowIcon)

        const optionsContainer = document.createElement('div')
        optionsContainer.id = 'category-options-container'
        // Increase z-index to ensure it sits on top of everything
        optionsContainer.style.cssText = `position: absolute; top: 100%; left: 0; margin-top: 8px; width: 100%; background: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 16px; box-shadow: 0 10px 40px ${colors.shadow}; display: none; flex-direction: column; overflow: hidden; backdrop-filter: blur(20px); max-height: 300px; overflow-y: auto; z-index: 9999;`
        optionsContainer.setAttribute('data-visible', 'false')

        // Toggle Logic
        dropdownTrigger.onclick = (e) => {
            e.stopPropagation()
            console.log('Dropdown clicked')
            const isVisible = optionsContainer.getAttribute('data-visible') === 'true'
            if (isVisible) {
                optionsContainer.style.display = 'none'
                optionsContainer.setAttribute('data-visible', 'false')
                arrowIcon.style.transform = 'rotate(0deg)'
            } else {
                optionsContainer.style.display = 'flex'
                optionsContainer.setAttribute('data-visible', 'true')
                arrowIcon.style.transform = 'rotate(180deg)'
                console.log('Dropdown opened', optionsContainer)
            }
        }

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (optionsContainer.getAttribute('data-visible') === 'true' && !dropdownContainer.contains(e.target)) {
                optionsContainer.style.display = 'none'
                optionsContainer.setAttribute('data-visible', 'false')
                arrowIcon.style.transform = 'rotate(0deg)'
            }
        })

        if (!mobile) {
            dropdownTrigger.onmouseenter = () => {
                dropdownTrigger.style.borderColor = colors.primary
                dropdownTrigger.style.boxShadow = `0 2px 8px ${colors.shadow}`
            }
            dropdownTrigger.onmouseleave = () => {
                dropdownTrigger.style.borderColor = colors.border
                dropdownTrigger.style.boxShadow = 'none'
            }
        }

        dropdownContainer.appendChild(dropdownTrigger)
        dropdownContainer.appendChild(optionsContainer)

        // Populate immediately
        this.populateCategoryDropdown(optionsContainer, triggerText)

        const buttonsContainer = document.createElement('div')
        buttonsContainer.style.cssText = `display: flex; gap: 8px; ${mobile ? 'flex: 1; justify-content: flex-end;' : ''}`

        const filters = [
            { key: 'favorite', label: '收藏' },
            { key: 'custom', label: '自定义' },
            { key: 'generate', label: '生图' },
            { key: 'edit', label: '编辑' }
        ]

        filters.forEach(filter => {
            const btn = document.createElement('button')
            btn.id = `filter-${filter.key}`
            btn.textContent = filter.label
            btn.style.cssText = `padding: ${mobile ? '10px 18px' : '8px 18px'}; border: 1px solid ${colors.border}; border-radius: 20px; background: ${colors.surface}; color: ${colors.text}; font-size: ${mobile ? '14px' : '13px'}; cursor: pointer; transition: all 0.25s ease; white-space: nowrap; touch-action: manipulation;`
            btn.onclick = () => this.toggleFilter(filter.key)
            buttonsContainer.appendChild(btn)
        })

        const addBtn = document.createElement('button')
        addBtn.textContent = '+'
        addBtn.title = '添加自定义 Prompt'
        addBtn.style.cssText = `padding: ${mobile ? '10px 18px' : '8px 18px'}; border: 1px solid ${colors.primary}; border-radius: 20px; background: ${colors.primary}; color: white; font-size: ${mobile ? '18px' : '16px'}; font-weight: 600; cursor: pointer; transition: all 0.25s ease; display: flex; align-items: center; justify-content: center; line-height: 1; box-shadow: 0 2px 8px ${colors.shadow};`
        addBtn.onclick = () => this.showAddPromptModal()

        buttonsContainer.appendChild(addBtn)

        filterContainer.appendChild(dropdownContainer)
        filterContainer.appendChild(buttonsContainer)

        searchSection.appendChild(searchContainer)
        searchSection.appendChild(filterContainer)

        return searchSection
    }

    createContent(colors, mobile) {
        const container = document.createElement('div')
        container.style.cssText = 'flex: 1; display: flex; flex-direction: column; overflow: hidden;'

        const scrollArea = document.createElement('div')
        scrollArea.id = 'prompts-scroll-area'
        scrollArea.style.cssText = `flex: 1; overflow-y: auto; padding: ${mobile ? '16px' : '20px 24px'}; -webkit-overflow-scrolling: touch;`

        const grid = document.createElement('div')
        grid.id = 'prompts-grid'
        grid.style.cssText = `display: grid; grid-template-columns: ${mobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)'}; gap: ${mobile ? '12px' : '16px'};`

        scrollArea.appendChild(grid)

        const pagination = document.createElement('div')
        pagination.id = 'prompts-pagination'
        pagination.style.cssText = `padding: ${mobile ? '12px' : '16px'}; border-top: 1px solid ${colors.border}; display: flex; justify-content: center; align-items: center; gap: 16px; background: ${colors.surface}; border-radius: ${mobile ? '0' : '0 0 20px 20px'};`

        container.appendChild(scrollArea)
        container.appendChild(pagination)

        return container
    }

    toggleFilter(filterKey) {
        const btn = document.getElementById(`filter-${filterKey}`)
        if (!btn) return

        const colors = this.adapter.getThemeColors()
        const mobile = this.isMobile()

        const setInactiveStyle = (targetBtn) => {
            targetBtn.style.cssText = `padding: ${mobile ? '10px 18px' : '8px 18px'}; border: 1px solid ${colors.border}; border-radius: 20px; background: ${colors.surface}; color: ${colors.text}; font-size: ${mobile ? '14px' : '13px'}; cursor: pointer; transition: all 0.25s ease; white-space: nowrap; touch-action: manipulation;`

            if (!mobile) {
                targetBtn.onmouseenter = () => {
                    targetBtn.style.transform = 'scale(1.05)'
                    targetBtn.style.boxShadow = `0 2px 8px ${colors.shadow}`
                }
                targetBtn.onmouseleave = () => {
                    targetBtn.style.transform = 'scale(1)'
                    targetBtn.style.boxShadow = 'none'
                }
            }
        }

        if (this.activeFilters.has(filterKey)) {
            this.activeFilters.delete(filterKey)
            setInactiveStyle(btn)
        } else {
            // Mutually exclusive logic for generate/edit
            if (filterKey === 'generate' && this.activeFilters.has('edit')) {
                this.activeFilters.delete('edit')
                const editBtn = document.getElementById('filter-edit')
                if (editBtn) setInactiveStyle(editBtn)
            }
            if (filterKey === 'edit' && this.activeFilters.has('generate')) {
                this.activeFilters.delete('generate')
                const generateBtn = document.getElementById('filter-generate')
                if (generateBtn) setInactiveStyle(generateBtn)
            }

            this.activeFilters.add(filterKey)
            btn.style.cssText = `padding: ${mobile ? '10px 18px' : '8px 18px'}; border: 1px solid ${colors.primary}; border-radius: 20px; background: ${colors.primary}; color: white; font-size: ${mobile ? '14px' : '13px'}; cursor: pointer; transition: all 0.25s ease; white-space: nowrap; touch-action: manipulation; box-shadow: 0 2px 8px ${colors.shadow};`

            if (!mobile) {
                btn.onmouseenter = () => {
                    btn.style.transform = 'scale(1.05)'
                    btn.style.boxShadow = `0 4px 12px ${colors.shadow}`
                }
                btn.onmouseleave = () => {
                    btn.style.transform = 'scale(1)'
                    btn.style.boxShadow = `0 2px 8px ${colors.shadow}`
                }
            }
        }

        this.applyFilters(true)
    }

    async toggleSortMode() {
        const newMode = this.sortMode === 'recommend' ? 'random' : 'recommend'
        await this.setSortMode(newMode)
        if (newMode === 'random') {
            this.randomMap.clear()
            this.ensureRandomValues()
        }

        // 更新按钮图标和 tooltip
        const sortBtn = document.getElementById('sort-mode-btn')
        const tooltip = document.getElementById('sort-tooltip')
        if (sortBtn) {
            const currentModeText = newMode === 'recommend' ? '随机焕新' : '推荐排序'
            sortBtn.innerHTML = newMode === 'recommend'
                ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>'
                : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>'

            if (tooltip) {
                tooltip.textContent = `切换${currentModeText}`
            }
        }

        // 重新应用过滤和排序
        this.applyFilters(true)
    }

    async applyFilters(resetPage = true) {
        const searchInput = document.getElementById('prompt-search')
        const keyword = searchInput ? searchInput.value.toLowerCase() : ''

        this.favorites = await this.getFavorites()

        let filtered = this.prompts.filter(prompt => {
            const matchesSearch = !keyword ||
                prompt.title.toLowerCase().includes(keyword) ||
                prompt.prompt.toLowerCase().includes(keyword) ||
                prompt.author.toLowerCase().includes(keyword)

            if (!matchesSearch) return false

            // Category Filter
            if (this.selectedCategory !== 'all' && prompt.category !== this.selectedCategory) {
                return false
            }

            if (this.activeFilters.size === 0) return true

            const promptId = `${prompt.title}-${prompt.author}`
            const isFavorite = this.favorites.includes(promptId)

            return Array.from(this.activeFilters).every(filter => {
                if (filter === 'favorite') return isFavorite
                if (filter === 'custom') return prompt.isCustom
                if (filter === 'generate') return prompt.mode === 'generate'
                if (filter === 'edit') return prompt.mode === 'edit'
                return false
            })
        })

        // Sort: Favorites > Custom > Others (根据 sortMode)
        // 先分组
        const favoriteItems = []
        const customItems = []
        const normalItems = []

        filtered.forEach(item => {
            const itemId = `${item.title}-${item.author}`
            const isFavorite = this.favorites.includes(itemId)

            if (isFavorite) {
                favoriteItems.push(item)
            } else if (item.isCustom) {
                customItems.push(item)
            } else {
                normalItems.push(item)
            }
        })

        // 普通项根据 sortMode 排序
        if (this.sortMode === 'random') {
            normalItems.sort((a, b) => a._randomVal - b._randomVal)
        }
        // recommend 模式下保持原顺序

        // 合并：收藏 > 自定义 > 普通
        filtered = [...favoriteItems, ...customItems, ...normalItems]

        this.filteredPrompts = filtered

        // 智能处理页码：只在需要时重置，或者当前页超出范围时调整
        if (resetPage) {
            this.currentPage = 1
        } else {
            // 确保当前页在有效范围内
            const totalPages = Math.ceil(this.filteredPrompts.length / this.pageSize)
            if (this.currentPage > totalPages && totalPages > 0) {
                this.currentPage = totalPages
            }
        }

        this.renderCurrentPage()
    }

    renderCurrentPage() {
        const grid = document.getElementById('prompts-grid')
        if (!grid) return

        const start = (this.currentPage - 1) * this.pageSize
        const end = start + this.pageSize
        const pageItems = this.filteredPrompts.slice(start, end)

        grid.innerHTML = ''

        if (pageItems.length === 0) {
            // 没有结果时，显示占位元素以保持高度
            const placeholder = document.createElement('div')
            const colors = this.adapter.getThemeColors()
            const mobile = this.isMobile()

            // 计算一页应该显示的行数
            const columns = mobile ? 2 : 4
            const rows = Math.ceil(this.pageSize / columns)
            const cardMinHeight = mobile ? 240 : 260
            const gap = mobile ? 12 : 16
            const minHeight = rows * cardMinHeight + (rows - 1) * gap

            placeholder.style.cssText = `
                grid-column: 1 / -1;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: ${minHeight}px;
                color: ${colors.textSecondary};
                font-size: ${mobile ? '14px' : '16px'};
            `
            placeholder.textContent = '没有找到相关提示词'
            grid.appendChild(placeholder)
        } else {
            // 添加实际的卡片
            pageItems.forEach(prompt => {
                const card = this.createPromptCard(prompt, this.favorites)
                grid.appendChild(card)
            })

            // 如果结果少于 pageSize，添加透明占位元素以保持高度
            if (pageItems.length < this.pageSize) {
                const remaining = this.pageSize - pageItems.length
                const mobile = this.isMobile()
                const cardMinHeight = mobile ? 240 : 260

                for (let i = 0; i < remaining; i++) {
                    const placeholder = document.createElement('div')
                    placeholder.style.cssText = `
                        min-height: ${cardMinHeight}px;
                        opacity: 0;
                        pointer-events: none;
                    `
                    grid.appendChild(placeholder)
                }
            }
        }

        // Scroll to top
        const scrollArea = document.getElementById('prompts-scroll-area')
        if (scrollArea) scrollArea.scrollTop = 0

        this.renderPagination()
    }

    renderPagination() {
        const pagination = document.getElementById('prompts-pagination')
        if (!pagination) return

        const totalPages = Math.ceil(this.filteredPrompts.length / this.pageSize)
        const colors = this.adapter.getThemeColors()
        const mobile = this.isMobile()

        pagination.innerHTML = ''

        if (totalPages <= 1) {
            pagination.style.display = 'none'
            return
        }
        // Layout configuration
        if (mobile) {
            pagination.style.cssText = `padding: 12px; border-top: 1px solid ${colors.border}; display: flex; flex-direction: column; align-items: center; gap: 12px; background: ${colors.surface}; border-radius: 0;`
        } else {
            pagination.style.cssText = `padding: 16px 24px; border-top: 1px solid ${colors.border}; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; background: ${colors.surface}; border-radius: 0 0 20px 20px;`
        }

        const createBtn = (text, disabled, onClick) => {
            const btn = document.createElement('button')
            btn.textContent = text
            btn.disabled = disabled
            btn.style.cssText = `padding: ${mobile ? '10px 20px' : '8px 18px'}; border: 1px solid ${colors.border}; border-radius: 12px; background: ${disabled ? colors.surface : colors.primary}; color: ${disabled ? colors.textSecondary : '#fff'}; cursor: ${disabled ? 'not-allowed' : 'pointer'}; font-size: ${mobile ? '14px' : '13px'}; transition: all 0.25s ease; opacity: ${disabled ? 0.5 : 1}; font-weight: 500;`
            if (!disabled) {
                btn.onclick = onClick
                if (!mobile) {
                    btn.onmouseenter = () => {
                        btn.style.transform = 'scale(1.05)'
                        btn.style.boxShadow = `0 4px 12px ${colors.shadow}`
                    }
                    btn.onmouseleave = () => {
                        btn.style.transform = 'scale(1)'
                        btn.style.boxShadow = 'none'
                    }
                }
            }
            return btn
        }

        const prevBtn = createBtn('上一页', this.currentPage === 1, () => this.changePage(-1))

        const pageInfo = document.createElement('span')
        pageInfo.textContent = `${this.currentPage} / ${totalPages}`
        pageInfo.style.cssText = `color: ${colors.text}; font-size: ${mobile ? '14px' : '13px'}; font-weight: 500;`

        const nextBtn = createBtn('下一页', this.currentPage === totalPages, () => this.changePage(1))

        // Controls Wrapper
        const controlsWrapper = document.createElement('div')
        controlsWrapper.style.cssText = 'display: flex; align-items: center; gap: 16px;'
        controlsWrapper.appendChild(prevBtn)
        controlsWrapper.appendChild(pageInfo)
        controlsWrapper.appendChild(nextBtn)

        // Social Links Container
        const socialContainer = document.createElement('div')
        socialContainer.style.cssText = `display: flex; align-items: center; gap: ${mobile ? '12px' : '16px'}; justify-content: ${mobile ? 'center' : 'flex-end'};`

        // GitHub Link
        const githubLink = document.createElement('a')
        githubLink.href = 'https://github.com/glidea/banana-prompt-quicker'
        githubLink.target = '_blank'
        githubLink.title = 'Star on GitHub'
        githubLink.innerHTML = `<svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>`
        githubLink.style.cssText = `color: ${colors.textSecondary}; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; padding: 8px; border-radius: 50%; cursor: pointer;`

        // Xiaohongshu Link
        const xhsLink = document.createElement('a')
        xhsLink.href = 'https://www.xiaohongshu.com/user/profile/5f7dc54d0000000001004afb'
        xhsLink.target = '_blank'
        xhsLink.title = '关注我的小红书'
        xhsLink.innerHTML = `<svg viewBox="0 0 1024 1024" width="20" height="20" fill="currentColor"><path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32z m-40 728H184V184h656v656zM312 376h400v80H312z m0 176h400v80H312z" /></svg>`
        xhsLink.style.cssText = `color: ${colors.textSecondary}; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center; padding: 8px; border-radius: 50%; cursor: pointer;`

        const addHoverEffect = (link, hoverColor, bg) => {
            if (!mobile) {
                link.onmouseenter = () => {
                    link.style.color = hoverColor
                    link.style.background = bg
                    link.style.transform = 'scale(1.1)'
                }
                link.onmouseleave = () => {
                    link.style.color = colors.textSecondary
                    link.style.background = 'transparent'
                    link.style.transform = 'scale(1)'
                }
            }
        }

        addHoverEffect(githubLink, colors.text, colors.surfaceHover)
        addHoverEffect(xhsLink, '#FF2442', mobile ? 'transparent' : 'rgba(255, 36, 66, 0.1)')

        socialContainer.appendChild(githubLink)
        socialContainer.appendChild(xhsLink)

        if (mobile) {
            pagination.appendChild(controlsWrapper)
            pagination.appendChild(socialContainer)
        } else {
            const spacer = document.createElement('div')
            pagination.appendChild(spacer)
            pagination.appendChild(controlsWrapper)
            pagination.appendChild(socialContainer)
        }
    }

    changePage(delta) {
        this.currentPage += delta
        this.renderCurrentPage()
    }

    handleKeyboard(event) {
        // 检查弹窗是否显示
        if (!this.modal || this.modal.style.display === 'none') {
            return
        }

        // 如果当前焦点在输入框中，不触发翻页
        const activeElement = document.activeElement
        if (activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        )) {
            return
        }

        // 计算总页数
        const totalPages = Math.ceil(this.filteredPrompts.length / this.pageSize)
        if (totalPages <= 1) {
            return
        }

        // 处理 Left/Right 键
        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            if (this.currentPage > 1) {
                this.changePage(-1)
            }
        } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            if (this.currentPage < totalPages) {
                this.changePage(1)
            }
        }
    }

    createPromptCard(prompt, favorites) {
        const promptId = `${prompt.title}-${prompt.author}`
        const isFavorite = favorites.includes(promptId)
        const colors = this.adapter.getThemeColors()
        const theme = this.adapter.getCurrentTheme()
        const mobile = this.isMobile()

        const card = document.createElement('div')
        card.className = 'prompt-card'
        card.style.cssText = `background: ${colors.surface}; border-radius: 16px; border: 1px solid ${colors.border}; cursor: pointer; overflow: hidden; transition: all 0.3s ease; min-height: ${mobile ? '240px' : '260px'}; position: relative; touch-action: manipulation; display: flex; flex-direction: column;`

        card.addEventListener('mouseenter', () => {
            if (!mobile) {
                card.style.boxShadow = `0 8px 24px ${colors.shadow}`
                card.style.transform = 'translateY(-4px)'
            }
        })
        card.addEventListener('mouseleave', () => {
            if (!mobile) {
                card.style.boxShadow = 'none'
                card.style.transform = 'translateY(0)'
            }
        })

        const img = document.createElement('img')
        img.src = prompt.preview
        img.alt = prompt.title
        img.style.cssText = `width: 100%; height: ${mobile ? '180px' : '200px'}; object-fit: cover; flex-shrink: 0;`
        img.onclick = () => this.adapter.insertPrompt(prompt.prompt)

        const favoriteBtn = document.createElement('button')
        const favBtnBg = isFavorite
            ? 'rgba(255,193,7,0.9)'
            : theme === 'dark'
                ? 'rgba(48,49,52,0.9)'
                : 'rgba(255,255,255,0.9)'
        const favBtnColor = isFavorite
            ? '#000'
            : theme === 'dark'
                ? '#e8eaed'
                : '#5f6368'

        favoriteBtn.style.cssText = `position: absolute; top: 12px; right: 12px; width: ${mobile ? '36px' : '32px'}; height: ${mobile ? '36px' : '32px'}; border-radius: 50%; border: none; background: ${favBtnBg}; color: ${favBtnColor}; font-size: ${mobile ? '16px' : '14px'}; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.25s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.15); backdrop-filter: blur(10px); touch-action: manipulation;`
        favoriteBtn.textContent = isFavorite ? '⭐' : '☆'
        favoriteBtn.onclick = (e) => {
            e.stopPropagation()
            this.toggleFavorite(promptId)
        }

        if (!mobile) {
            favoriteBtn.addEventListener('mouseenter', () => {
                favoriteBtn.style.transform = 'scale(1.15)'
                favoriteBtn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.25)'
            })
            favoriteBtn.addEventListener('mouseleave', () => {
                favoriteBtn.style.transform = 'scale(1)'
                favoriteBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
            })
        }

        const content = document.createElement('div')
        content.style.cssText = 'padding: 12px; flex: 1; display: flex; flex-direction: column; gap: 8px; justify-content: flex-start; min-height: 0; overflow: hidden;'

        const title = document.createElement('h3')
        title.style.cssText = `font-size: ${mobile ? '15px' : '14px'}; font-weight: 500; color: ${colors.text}; margin: 0; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
        title.textContent = prompt.title
        title.onclick = () => this.adapter.insertPrompt(prompt.prompt)

        const bottomRow = document.createElement('div')
        bottomRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-top: 4px;'

        const author = document.createElement('span')
        author.style.cssText = `font-size: ${mobile ? '13px' : '12px'}; color: ${colors.textSecondary}; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; margin-right: 8px;`
        author.textContent = prompt.author

        if (prompt.link) {
            author.style.textDecoration = 'underline'
            author.title = '点击查看原贴'
            author.onclick = (e) => {
                e.stopPropagation()
                window.open(prompt.link, '_blank')
            }
        } else {
            author.onclick = () => this.adapter.insertPrompt(prompt.prompt)
        }

        const modeTag = document.createElement('span')
        const isEdit = prompt.mode === 'edit'
        const tagBg = theme === 'dark'
            ? (isEdit ? 'rgba(10, 132, 255, 0.15)' : 'rgba(48, 209, 88, 0.15)')
            : (isEdit ? 'rgba(0, 122, 255, 0.12)' : 'rgba(52, 199, 89, 0.12)')
        const tagColor = theme === 'dark'
            ? (isEdit ? '#0a84ff' : '#30d158')
            : (isEdit ? '#007aff' : '#34c759')
        modeTag.style.cssText = `background: ${tagBg}; color: ${tagColor}; padding: 4px 10px; border-radius: 12px; font-size: ${mobile ? '12px' : '11px'}; font-weight: 600; backdrop-filter: blur(10px); flex-shrink: 0;`
        modeTag.textContent = isEdit ? '编辑' : '生图'

        bottomRow.appendChild(author)
        bottomRow.appendChild(modeTag)
        content.appendChild(title)
        content.appendChild(bottomRow)
        if (prompt.isCustom) {
            const deleteBtn = document.createElement('button')
            deleteBtn.textContent = '×'
            deleteBtn.title = '删除'
            deleteBtn.style.cssText = `position: absolute; top: 12px; left: 12px; width: ${mobile ? '36px' : '32px'}; height: ${mobile ? '36px' : '32px'}; border-radius: 50%; border: none; background: rgba(0,0,0,0.7); color: white; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.25s ease; z-index: 2; line-height: 1; padding-bottom: 2px; backdrop-filter: blur(10px); box-shadow: 0 4px 12px rgba(0,0,0,0.15);`

            deleteBtn.onclick = (e) => {
                e.stopPropagation()
                if (confirm('确定要删除这个 Prompt 吗？')) {
                    this.deleteCustomPrompt(prompt.id)
                }
            }

            card.appendChild(deleteBtn)
        }

        card.appendChild(img)
        card.appendChild(favoriteBtn)
        card.appendChild(content)

        return card
    }

    async getFavorites() {
        const result = await chrome.storage.sync.get(['banana-favorites'])
        return result['banana-favorites'] || []
    }

    async toggleFavorite(promptId) {
        const favorites = await this.getFavorites()
        const index = favorites.indexOf(promptId)

        if (index > -1) {
            favorites.splice(index, 1)
        } else {
            favorites.push(promptId)
        }

        await chrome.storage.sync.set({ 'banana-favorites': favorites })
        this.applyFilters(false)
    }

    showAddPromptModal() {
        const colors = this.adapter.getThemeColors()
        const mobile = this.isMobile()

        const overlay = document.createElement('div')
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1100;'
        overlay.onclick = (e) => {
            if (e.target === overlay) document.body.removeChild(overlay)
        }

        const dialog = document.createElement('div')
        dialog.style.cssText = `background: ${colors.surface}; padding: ${mobile ? '28px' : '32px'}; border-radius: 20px; width: ${mobile ? '90%' : '500px'}; max-width: 90%; box-shadow: 0 20px 60px ${colors.shadow}; display: flex; flex-direction: column; gap: 20px; color: ${colors.text};`
        dialog.onclick = (e) => e.stopPropagation()

        const title = document.createElement('h3')
        title.textContent = '添加自定义 Prompt'
        title.style.cssText = 'margin: 0 0 8px 0; font-size: 20px; font-weight: 600;'

        const createInput = (placeholder, isTextarea = false) => {
            const input = document.createElement(isTextarea ? 'textarea' : 'input')
            input.placeholder = placeholder
            input.style.cssText = `width: 100%; padding: ${mobile ? '14px 16px' : '12px 16px'}; border: 1px solid ${colors.inputBorder}; border-radius: 12px; background: ${colors.inputBg}; color: ${colors.text}; font-size: 14px; outline: none; box-sizing: border-box; transition: all 0.2s; ${isTextarea ? 'min-height: 120px; resize: vertical; font-family: inherit;' : ''}`
            input.onfocus = () => {
                input.style.borderColor = colors.primary
                input.style.boxShadow = `0 0 0 3px ${colors.primary}15`
            }
            input.onblur = () => {
                input.style.borderColor = colors.inputBorder
                input.style.boxShadow = 'none'
            }
            return input
        }

        const titleInput = createInput('标题')

        // Image Upload UI
        const imageContainer = document.createElement('div')
        imageContainer.style.cssText = `display: flex; align-items: center; gap: 12px; width: 100%;`

        const fileInput = document.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = 'image/*'
        fileInput.style.display = 'none'

        const previewBtn = document.createElement('div')
        previewBtn.style.cssText = `width: 60px; height: 60px; border-radius: 12px; border: 1px dashed ${colors.border}; background: ${colors.inputBg}; cursor: pointer; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; flex-shrink: 0; transition: all 0.2s;`

        const placeholderIcon = document.createElement('span')
        placeholderIcon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${colors.textSecondary}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`
        previewBtn.appendChild(placeholderIcon)

        const previewImg = document.createElement('img')
        previewImg.style.cssText = `width: 100%; height: 100%; object-fit: cover; display: none;`
        previewBtn.appendChild(previewImg)

        const uploadTip = document.createElement('span')
        uploadTip.textContent = '上传封面 (可选)'
        uploadTip.style.cssText = `font-size: 13px; color: ${colors.textSecondary};`

        const clearImgBtn = document.createElement('button')
        clearImgBtn.innerHTML = '×'
        clearImgBtn.style.cssText = `margin-left: auto; width: 24px; height: 24px; border-radius: 50%; background: ${colors.border}; color: ${colors.text}; border: none; cursor: pointer; display: none; align-items: center; justify-content: center; font-size: 16px; padding-bottom: 2px;`

        previewBtn.onclick = () => fileInput.click()

        let selectedFile = null

        fileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0]
                selectedFile = file

                const reader = new FileReader()
                reader.onload = (evt) => {
                    previewImg.src = evt.target.result
                    previewImg.style.display = 'block'
                    placeholderIcon.style.display = 'none'
                    previewBtn.style.borderStyle = 'solid'
                    clearImgBtn.style.display = 'flex'
                }
                reader.readAsDataURL(file)
            }
        }

        clearImgBtn.onclick = () => {
            fileInput.value = ''
            selectedFile = null
            previewImg.src = ''
            previewImg.style.display = 'none'
            placeholderIcon.style.display = 'block'
            previewBtn.style.borderStyle = 'dashed'
            clearImgBtn.style.display = 'none'
        }

        imageContainer.appendChild(fileInput)
        imageContainer.appendChild(previewBtn)
        imageContainer.appendChild(uploadTip)
        imageContainer.appendChild(clearImgBtn)

        const promptInput = createInput('Prompt 内容', true)

        // Category Dropdown for Add Prompt
        const categoryContainer = document.createElement('div')
        categoryContainer.style.cssText = 'position: relative; width: 100%; z-index: 10;'

        const categoryTrigger = document.createElement('div')
        categoryTrigger.style.cssText = `width: 100%; padding: ${mobile ? '14px 16px' : '12px 16px'}; border: 1px solid ${colors.inputBorder}; border-radius: 12px; background: ${colors.inputBg}; color: ${colors.text}; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;`

        // Populate categories
        // Populate categories
        const addCategories = Array.from(this.categories)
            .filter(c => c !== '全部')
            .sort((a, b) => a.localeCompare(b))

        let selectedAddCategory = addCategories[0]
        const categoryTriggerText = document.createElement('span')
        categoryTriggerText.textContent = selectedAddCategory

        const categoryArrow = document.createElement('span')
        categoryArrow.innerHTML = `<svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1L5 5L9 1"/></svg>`
        categoryArrow.style.cssText = `display: flex; align-items: center; transition: transform 0.2s; opacity: 0.6;`

        categoryTrigger.appendChild(categoryTriggerText)
        categoryTrigger.appendChild(categoryArrow)

        const categoryOptions = document.createElement('div')
        categoryOptions.style.cssText = `position: absolute; top: 100%; left: 0; margin-top: 8px; width: 100%; background: ${colors.surface}; border: 1px solid ${colors.border}; border-radius: 12px; box-shadow: 0 10px 40px ${colors.shadow}; display: none; flex-direction: column; overflow: hidden; backdrop-filter: blur(20px); max-height: 200px; overflow-y: auto; z-index: 100;`

        // Populate categories
        addCategories.forEach(cat => {
            const option = document.createElement('div')
            option.textContent = cat
            const isSelected = cat === selectedAddCategory

            const baseStyle = `padding: 10px 16px; cursor: pointer; transition: all 0.2s; font-size: 14px;`
            const selectedStyle = isSelected
                ? `background: ${colors.primary}15; color: ${colors.primary}; font-weight: 600;`
                : `background: transparent; color: ${colors.text};`
            option.style.cssText = baseStyle + selectedStyle

            option.onmouseenter = () => {
                if (!isSelected) {
                    option.style.background = colors.surfaceHover
                }
                option.style.boxShadow = `0 2px 8px ${colors.shadow}`
            }
            option.onmouseleave = () => {
                if (!isSelected) {
                    option.style.background = 'transparent'
                } else {
                    option.style.background = `${colors.primary}15`
                }
                option.style.boxShadow = 'none'
            }

            option.onclick = (e) => {
                e.stopPropagation()
                selectedAddCategory = cat
                categoryTriggerText.textContent = cat
                categoryOptions.style.display = 'none'
                categoryArrow.style.transform = 'rotate(0deg)'

                // 重新渲染选项以更新高亮状态
                categoryOptions.innerHTML = ''
                addCategories.forEach(c => {
                    const opt = document.createElement('div')
                    opt.textContent = c
                    const selected = c === selectedAddCategory

                    const base = `padding: 10px 16px; cursor: pointer; transition: all 0.2s; font-size: 14px;`
                    const style = selected
                        ? `background: ${colors.primary}15; color: ${colors.primary}; font-weight: 600;`
                        : `background: transparent; color: ${colors.text};`
                    opt.style.cssText = base + style

                    opt.onmouseenter = () => {
                        if (!selected) opt.style.background = colors.surfaceHover
                        opt.style.boxShadow = `0 2px 8px ${colors.shadow}`
                    }
                    opt.onmouseleave = () => {
                        if (!selected) {
                            opt.style.background = 'transparent'
                        } else {
                            opt.style.background = `${colors.primary}15`
                        }
                        opt.style.boxShadow = 'none'
                    }

                    opt.onclick = (e) => {
                        e.stopPropagation()
                        selectedAddCategory = c
                        categoryTriggerText.textContent = c
                        categoryOptions.style.display = 'none'
                        categoryArrow.style.transform = 'rotate(0deg)'
                    }
                    categoryOptions.appendChild(opt)
                })
            }
            categoryOptions.appendChild(option)
        })

        categoryTrigger.onclick = (e) => {
            e.stopPropagation()
            const isVisible = categoryOptions.style.display === 'flex'
            categoryOptions.style.display = isVisible ? 'none' : 'flex'
            categoryArrow.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)'
        }

        // Close dropdown when clicking outside
        const closeDropdown = (e) => {
            if (!categoryContainer.contains(e.target)) {
                categoryOptions.style.display = 'none'
                categoryArrow.style.transform = 'rotate(0deg)'
            }
        }
        document.addEventListener('click', closeDropdown)

        // Cleanup listener when modal closes
        const cleanup = () => document.removeEventListener('click', closeDropdown)

        categoryContainer.appendChild(categoryTrigger)
        categoryContainer.appendChild(categoryOptions)

        const modeContainer = document.createElement('div')
        modeContainer.style.display = 'flex'
        modeContainer.style.gap = '16px'

        let selectedMode = 'generate'
        const createRadio = (value, label) => {
            const labelEl = document.createElement('label')
            labelEl.style.cssText = 'display: flex; align-items: center; gap: 6px; cursor: pointer;'

            const radio = document.createElement('input')
            radio.type = 'radio'
            radio.name = 'prompt-mode'
            radio.value = value
            radio.checked = value === selectedMode
            radio.onchange = () => selectedMode = value

            labelEl.appendChild(radio)
            labelEl.appendChild(document.createTextNode(label))
            return labelEl
        }

        modeContainer.appendChild(createRadio('generate', '生图'))
        modeContainer.appendChild(createRadio('edit', '编辑'))

        const btnContainer = document.createElement('div')
        btnContainer.style.cssText = 'display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px;'

        const cancelBtn = document.createElement('button')
        cancelBtn.textContent = '取消'
        cancelBtn.style.cssText = `padding: ${mobile ? '12px 24px' : '10px 20px'}; border: 1px solid ${colors.border}; border-radius: 12px; background: transparent; color: ${colors.text}; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.25s ease;`
        cancelBtn.onclick = () => {
            cleanup()
            document.body.removeChild(overlay)
        }

        if (!mobile) {
            cancelBtn.onmouseenter = () => {
                cancelBtn.style.background = colors.hover
                cancelBtn.style.transform = 'scale(1.05)'
            }
            cancelBtn.onmouseleave = () => {
                cancelBtn.style.background = 'transparent'
                cancelBtn.style.transform = 'scale(1)'
            }
        }

        const saveBtn = document.createElement('button')
        saveBtn.textContent = '保存'
        saveBtn.style.cssText = `padding: ${mobile ? '12px 24px' : '10px 20px'}; border: none; border-radius: 12px; background: ${colors.primary}; color: white; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.25s ease; box-shadow: 0 2px 8px ${colors.shadow};`
        saveBtn.onclick = async () => {
            const titleVal = titleInput.value.trim()
            const promptVal = promptInput.value.trim()

            if (!titleVal || !promptVal) {
                alert('请填写标题和内容')
                return
            }

            let previewDataUrl = 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg'

            if (selectedFile) {
                try {
                    saveBtn.textContent = '处理中...'
                    saveBtn.disabled = true
                    previewDataUrl = await this.compressImage(selectedFile)
                } catch (err) {
                    console.error('图片压缩失败', err)
                    alert('图片处理失败，将使用默认图标')
                } finally {
                    saveBtn.textContent = '保存'
                    saveBtn.disabled = false
                }
            }

            await this.saveCustomPrompt({
                title: titleVal,
                prompt: promptVal,
                mode: selectedMode,
                category: selectedAddCategory,
                preview: previewDataUrl
            })
            document.body.removeChild(overlay)
            cleanup()
        }

        if (!mobile) {
            saveBtn.onmouseenter = () => {
                saveBtn.style.transform = 'scale(1.05)'
                saveBtn.style.boxShadow = `0 4px 16px ${colors.shadow}`
            }
            saveBtn.onmouseleave = () => {
                saveBtn.style.transform = 'scale(1)'
                saveBtn.style.boxShadow = `0 2px 8px ${colors.shadow}`
            }
        }

        btnContainer.appendChild(cancelBtn)
        btnContainer.appendChild(saveBtn)

        dialog.appendChild(title)
        dialog.appendChild(titleInput)
        dialog.appendChild(imageContainer)
        dialog.appendChild(categoryContainer)
        dialog.appendChild(promptInput)
        dialog.appendChild(modeContainer)
        dialog.appendChild(btnContainer)

        overlay.appendChild(dialog)
        document.body.appendChild(overlay)
    }

    async deleteCustomPrompt(promptId) {
        const customPrompts = await this.getCustomPrompts()
        const newPrompts = customPrompts.filter(p => p.id !== promptId)
        await chrome.storage.local.set({ 'banana-custom-prompts': newPrompts })
        await this.loadPrompts()
    }

    async saveCustomPrompt(data) {
        const newPrompt = {
            ...data,
            author: 'Me',
            isCustom: true,
            id: Date.now(),
            preview: data.preview || 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg'
        }

        const customPrompts = await this.getCustomPrompts()
        customPrompts.unshift(newPrompt)

        await chrome.storage.local.set({ 'banana-custom-prompts': customPrompts })
        await this.loadPrompts()
    }
}

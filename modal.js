/**
 * BananaModal - 通用的 Prompt 选择模态窗
 * 负责 UI 渲染、搜索过滤、收藏管理
 */
class BananaModal {
    constructor(adapter) {
        this.adapter = adapter
        this.modal = null
        this.activeFilters = new Set()
        this.prompts = []
        this.customPrompts = []
        this.loadPrompts()
        this.currentPage = 1
        this.pageSize = this.isMobile() ? 8 : 12
        this.filteredPrompts = []
        this.favorites = []
    }

    async loadPrompts() {
        let staticPrompts = []
        if (window.PromptManager) {
            staticPrompts = await window.PromptManager.get()
        }
        this.customPrompts = await this.getCustomPrompts()
        // 合并静态 Prompt 和自定义 Prompt，自定义的排在前面
        this.prompts = [...this.customPrompts, ...staticPrompts]
        this.applyFilters()
    }

    async getCustomPrompts() {
        const result = await chrome.storage.local.get(['banana-custom-prompts'])
        return result['banana-custom-prompts'] || []
    }

    show() {
        if (!this.modal) {
            this.modal = this.createModal()
            document.body.appendChild(this.modal)
        }
        this.modal.style.display = 'flex'
        this.applyFilters()
    }

    hide() {
        if (this.modal) {
            this.modal.style.display = 'none'
        }
    }

    isMobile() {
        return window.innerWidth <= 768
    }

    createModal() {
        const colors = this.adapter.getThemeColors()
        const mobile = this.isMobile()

        const modalElement = document.createElement('div')
        modalElement.id = 'prompts-modal'
        modalElement.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000;'

        const container = document.createElement('div')
        container.style.cssText = `background: ${colors.background}; border-radius: ${mobile ? '12px 12px 0 0' : '8px'}; box-shadow: 0 8px 32px ${colors.shadow}; max-width: ${mobile ? '100%' : '900px'}; width: ${mobile ? '100%' : '90%'}; max-height: ${mobile ? '90vh' : '85vh'}; display: flex; flex-direction: column; ${mobile ? 'margin-top: auto;' : ''}`
        container.onclick = (e) => e.stopPropagation()

        const searchSection = this.createSearchSection(colors, mobile)
        const content = this.createContent(colors, mobile)

        container.appendChild(searchSection)
        container.appendChild(content)
        modalElement.appendChild(container)

        modalElement.addEventListener('click', () => this.hide())

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
        searchSection.style.cssText = `padding: ${mobile ? '16px' : '20px 24px'}; border-bottom: 1px solid ${colors.border}; display: flex; ${mobile ? 'flex-direction: column; gap: 12px;' : 'align-items: center; gap: 16px;'}`

        const searchInput = document.createElement('input')
        searchInput.type = 'text'
        searchInput.id = 'prompt-search'
        searchInput.placeholder = '搜索...'
        searchInput.style.cssText = `${mobile ? 'width: 100%;' : 'flex: 1;'} padding: ${mobile ? '12px 16px' : '10px 16px'}; border: 1px solid ${colors.inputBorder}; border-radius: 12px; outline: none; font-size: ${mobile ? '16px' : '14px'}; background: ${colors.inputBg}; color: ${colors.text}; box-sizing: border-box;`
        searchInput.addEventListener('input', () => this.applyFilters())

        searchInput.addEventListener('focus', () => {
            searchInput.style.borderColor = colors.primary
        })
        searchInput.addEventListener('blur', () => {
            const currentColors = this.adapter.getThemeColors()
            searchInput.style.borderColor = currentColors.inputBorder
        })

        const filterContainer = document.createElement('div')
        filterContainer.style.cssText = `display: flex; gap: 8px; ${mobile ? 'justify-content: center; flex-wrap: wrap;' : ''}`

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
            btn.style.cssText = `padding: ${mobile ? '10px 16px' : '8px 16px'}; border: 1px solid ${colors.border}; border-radius: 16px; background: ${colors.surface}; color: ${colors.text}; font-size: ${mobile ? '14px' : '13px'}; cursor: pointer; transition: all 0.2s; white-space: nowrap; touch-action: manipulation;`
            btn.onclick = () => this.toggleFilter(filter.key)
            filterContainer.appendChild(btn)
        })

        const addBtn = document.createElement('button')
        addBtn.textContent = '+'
        addBtn.title = '添加自定义 Prompt'
        addBtn.style.cssText = `padding: ${mobile ? '10px 16px' : '8px 16px'}; border: 1px solid ${colors.primary}; border-radius: 16px; background: ${colors.primary}; color: white; font-size: ${mobile ? '18px' : '16px'}; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; line-height: 1;`
        addBtn.onclick = () => this.showAddPromptModal()

        filterContainer.appendChild(addBtn)

        searchSection.appendChild(searchInput)
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
        pagination.style.cssText = `padding: ${mobile ? '12px' : '16px'}; border-top: 1px solid ${colors.border}; display: flex; justify-content: center; align-items: center; gap: 16px; background: ${colors.surface};`

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
            targetBtn.style.cssText = `padding: ${mobile ? '10px 16px' : '8px 16px'}; border: 1px solid ${colors.border}; border-radius: 16px; background: ${colors.surface}; color: ${colors.text}; font-size: ${mobile ? '14px' : '13px'}; cursor: pointer; transition: all 0.2s; white-space: nowrap; touch-action: manipulation;`
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
            btn.style.cssText = `padding: ${mobile ? '10px 16px' : '8px 16px'}; border: 1px solid ${colors.primary}; border-radius: 16px; background: ${colors.primary}; color: white; font-size: ${mobile ? '14px' : '13px'}; cursor: pointer; transition: all 0.2s; white-space: nowrap; touch-action: manipulation;`
        }

        this.applyFilters()
    }

    async applyFilters() {
        const searchInput = document.getElementById('prompt-search')
        const keyword = searchInput ? searchInput.value.toLowerCase() : ''

        this.favorites = await this.getFavorites()

        let filtered = this.prompts.filter(prompt => {
            const matchesSearch = !keyword ||
                prompt.title.toLowerCase().includes(keyword) ||
                prompt.prompt.toLowerCase().includes(keyword) ||
                prompt.author.toLowerCase().includes(keyword)

            if (!matchesSearch) return false

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

        // Sort: Favorites first
        // Sort: Favorites > Custom > Others
        filtered.sort((a, b) => {
            const aId = `${a.title}-${a.author}`
            const bId = `${b.title}-${b.author}`
            const aIsFavorite = this.favorites.includes(aId)
            const bIsFavorite = this.favorites.includes(bId)

            if (aIsFavorite && !bIsFavorite) return -1
            if (!aIsFavorite && bIsFavorite) return 1

            if (a.isCustom && !b.isCustom) return -1
            if (!a.isCustom && b.isCustom) return 1

            return 0
        })

        this.filteredPrompts = filtered
        this.currentPage = 1
        this.renderCurrentPage()
    }

    renderCurrentPage() {
        const grid = document.getElementById('prompts-grid')
        if (!grid) return

        const start = (this.currentPage - 1) * this.pageSize
        const end = start + this.pageSize
        const pageItems = this.filteredPrompts.slice(start, end)

        grid.innerHTML = ''
        pageItems.forEach(prompt => {
            const card = this.createPromptCard(prompt, this.favorites)
            grid.appendChild(card)
        })

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
        pagination.style.display = 'flex'

        const createBtn = (text, disabled, onClick) => {
            const btn = document.createElement('button')
            btn.textContent = text
            btn.disabled = disabled
            btn.style.cssText = `padding: ${mobile ? '8px 16px' : '6px 16px'}; border: 1px solid ${colors.border}; border-radius: 8px; background: ${disabled ? colors.surface : colors.primary}; color: ${disabled ? colors.textSecondary : '#fff'}; cursor: ${disabled ? 'not-allowed' : 'pointer'}; font-size: ${mobile ? '14px' : '13px'}; transition: all 0.2s; opacity: ${disabled ? 0.5 : 1};`
            if (!disabled) btn.onclick = onClick
            return btn
        }

        const prevBtn = createBtn('上一页', this.currentPage === 1, () => this.changePage(-1))

        const pageInfo = document.createElement('span')
        pageInfo.textContent = `${this.currentPage} / ${totalPages}`
        pageInfo.style.cssText = `color: ${colors.text}; font-size: ${mobile ? '14px' : '13px'}; font-weight: 500;`

        const nextBtn = createBtn('下一页', this.currentPage === totalPages, () => this.changePage(1))

        const starLink = document.createElement('a')
        starLink.href = 'https://github.com/glidea/banana-prompt-quicker'
        starLink.target = '_blank'
        starLink.textContent = mobile ? '⭐' : '⭐ Star 项目或贡献 Prompt'
        starLink.style.cssText = `padding: ${mobile ? '8px 12px' : '6px 16px'}; border: 1px solid ${colors.border}; border-radius: 8px; background: ${colors.surface}; color: ${colors.text}; text-decoration: none; font-size: ${mobile ? '14px' : '13px'}; transition: all 0.2s; display: flex; align-items: center; gap: 4px; margin-left: ${mobile ? '8px' : '16px'};`
        starLink.onmouseenter = () => {
            if (!mobile) {
                starLink.style.background = colors.primary
                starLink.style.color = '#fff'
                starLink.style.borderColor = colors.primary
            }
        }
        starLink.onmouseleave = () => {
            if (!mobile) {
                starLink.style.background = colors.surface
                starLink.style.color = colors.text
                starLink.style.borderColor = colors.border
            }
        }

        pagination.appendChild(prevBtn)
        pagination.appendChild(pageInfo)
        pagination.appendChild(nextBtn)
        pagination.appendChild(starLink)
    }

    changePage(delta) {
        this.currentPage += delta
        this.renderCurrentPage()
    }

    createPromptCard(prompt, favorites) {
        const promptId = `${prompt.title}-${prompt.author}`
        const isFavorite = favorites.includes(promptId)
        const colors = this.adapter.getThemeColors()
        const theme = this.adapter.getCurrentTheme()
        const mobile = this.isMobile()

        const card = document.createElement('div')
        card.className = 'prompt-card'
        card.style.cssText = `background: ${colors.surface}; border-radius: 8px; border: 1px solid ${colors.border}; cursor: pointer; overflow: hidden; transition: box-shadow 0.2s; aspect-ratio: 4/5; position: relative; touch-action: manipulation;`

        card.addEventListener('mouseenter', () => {
            if (!mobile) card.style.boxShadow = `0 2px 8px ${colors.shadow}`
        })
        card.addEventListener('mouseleave', () => {
            if (!mobile) card.style.boxShadow = 'none'
        })

        const img = document.createElement('img')
        img.src = prompt.preview
        img.alt = prompt.title
        img.style.cssText = 'width: 100%; height: 65%; object-fit: cover;'
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

        favoriteBtn.style.cssText = `position: absolute; top: 8px; right: 8px; width: ${mobile ? '32px' : '28px'}; height: ${mobile ? '32px' : '28px'}; border-radius: 50%; border: none; background: ${favBtnBg}; color: ${favBtnColor}; font-size: ${mobile ? '16px' : '14px'}; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2); touch-action: manipulation;`
        favoriteBtn.textContent = isFavorite ? '⭐' : '☆'
        favoriteBtn.onclick = (e) => {
            e.stopPropagation()
            this.toggleFavorite(promptId)
        }

        if (!mobile) {
            favoriteBtn.addEventListener('mouseenter', () => {
                favoriteBtn.style.transform = 'scale(1.1)'
            })
            favoriteBtn.addEventListener('mouseleave', () => {
                favoriteBtn.style.transform = 'scale(1)'
            })
        }

        const content = document.createElement('div')
        content.style.cssText = 'padding: 12px; height: 35%; display: flex; flex-direction: column; justify-content: space-between;'

        const title = document.createElement('h3')
        title.style.cssText = `font-size: ${mobile ? '15px' : '14px'}; font-weight: 500; color: ${colors.text}; margin: 0; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
        title.textContent = prompt.title
        title.onclick = () => this.adapter.insertPrompt(prompt.prompt)

        const bottomRow = document.createElement('div')
        bottomRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;'

        const author = document.createElement('span')
        author.style.cssText = `font-size: ${mobile ? '13px' : '12px'}; color: ${colors.textSecondary}; font-weight: 400;`
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
        modeTag.style.cssText = `background: ${prompt.mode === 'edit' ? '#e8f0fe' : '#e6f4ea'}; color: ${prompt.mode === 'edit' ? '#1967d2' : '#137333'}; padding: 4px 8px; border-radius: 12px; font-size: ${mobile ? '12px' : '11px'}; font-weight: 500;`
        modeTag.textContent = prompt.mode === 'edit' ? '编辑' : '生图'

        bottomRow.appendChild(author)
        bottomRow.appendChild(modeTag)
        content.appendChild(title)
        content.appendChild(bottomRow)
        if (prompt.isCustom) {
            const deleteBtn = document.createElement('button')
            deleteBtn.textContent = '×'
            deleteBtn.title = '删除'
            deleteBtn.style.cssText = `position: absolute; top: 8px; left: 8px; width: ${mobile ? '32px' : '28px'}; height: ${mobile ? '32px' : '28px'}; border-radius: 50%; border: none; background: rgba(0,0,0,0.5); color: white; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; z-index: 2; line-height: 1; padding-bottom: 2px;`

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
        this.applyFilters()
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
        dialog.style.cssText = `background: ${colors.surface}; padding: 24px; border-radius: 12px; width: ${mobile ? '90%' : '500px'}; max-width: 90%; box-shadow: 0 4px 24px rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 16px; color: ${colors.text};`
        dialog.onclick = (e) => e.stopPropagation()

        const title = document.createElement('h3')
        title.textContent = '添加自定义 Prompt'
        title.style.margin = '0 0 8px 0'

        const createInput = (placeholder, isTextarea = false) => {
            const input = document.createElement(isTextarea ? 'textarea' : 'input')
            input.placeholder = placeholder
            input.style.cssText = `width: 100%; padding: 12px; border: 1px solid ${colors.inputBorder}; border-radius: 8px; background: ${colors.inputBg}; color: ${colors.text}; font-size: 14px; outline: none; box-sizing: border-box; ${isTextarea ? 'min-height: 100px; resize: vertical;' : ''}`
            input.onfocus = () => input.style.borderColor = colors.primary
            input.onblur = () => input.style.borderColor = colors.inputBorder
            return input
        }

        const titleInput = createInput('标题')
        const promptInput = createInput('Prompt 内容', true)

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
        cancelBtn.style.cssText = `padding: 8px 16px; border: 1px solid ${colors.border}; border-radius: 6px; background: transparent; color: ${colors.text}; cursor: pointer;`
        cancelBtn.onclick = () => document.body.removeChild(overlay)

        const saveBtn = document.createElement('button')
        saveBtn.textContent = '保存'
        saveBtn.style.cssText = `padding: 8px 16px; border: none; border-radius: 6px; background: ${colors.primary}; color: white; cursor: pointer;`
        saveBtn.onclick = async () => {
            const titleVal = titleInput.value.trim()
            const promptVal = promptInput.value.trim()

            if (!titleVal || !promptVal) {
                alert('请填写标题和内容')
                return
            }

            await this.saveCustomPrompt({
                title: titleVal,
                prompt: promptVal,
                mode: selectedMode
            })
            document.body.removeChild(overlay)
        }

        btnContainer.appendChild(cancelBtn)
        btnContainer.appendChild(saveBtn)

        dialog.appendChild(title)
        dialog.appendChild(titleInput)
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
            preview: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg' // 默认图标
        }

        const customPrompts = await this.getCustomPrompts()
        customPrompts.unshift(newPrompt)

        await chrome.storage.local.set({ 'banana-custom-prompts': customPrompts })
        await this.loadPrompts()
    }
}
